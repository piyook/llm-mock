import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	collectStrings,
	findMatchingRule,
	loadRuleContent,
	readRuleFile,
	ruleFiles,
	validateResponseRules,
	type ResponseRule,
} from '../../utilities/response-rules.js';
import { normaliseRequest } from '../../utilities/normalise-request.js';

describe('collectStrings', () => {
	test('collects nested string values and ignores keys and non-strings', () => {
		const body = {
			model: 'm',
			max_tokens: 5,
			stream: true,
			system: [{ type: 'text', text: 'be brief' }],
			messages: [
				{ role: 'user', content: 'hello' },
				{ role: 'user', content: [{ type: 'text', text: 'again' }] },
			],
		};

		const strings = collectStrings(body);

		expect(strings).toEqual(
			expect.arrayContaining(['be brief', 'hello', 'again', 'm']),
		);
		expect(strings).not.toContain('messages');
		expect(strings).not.toContain(5);
	});

	test('handles null, undefined and primitives', () => {
		expect(collectStrings(null)).toEqual([]);
		expect(collectStrings(undefined)).toEqual([]);
		expect(collectStrings(42)).toEqual([]);
		expect(collectStrings('only')).toEqual(['only']);
	});
});

describe('findMatchingRule', () => {
	const find = (list: ResponseRule[], body: unknown) =>
		findMatchingRule(list, normaliseRequest(body));

	const rules = [
		{ match: 'ALPHA', file: 'a.txt' },
		{ match: 'BETA', file: 'b.txt' },
	];

	test('returns the rule whose text appears in the request', () => {
		const body = { messages: [{ role: 'user', content: 'say BETA now' }] };
		expect(find(rules, body)?.file).toBe('b.txt');
	});

	test('first matching rule in config order wins', () => {
		const body = {
			messages: [{ role: 'user', content: 'BETA and ALPHA' }],
		};
		expect(find(rules, body)?.file).toBe('a.txt');
	});

	test('matches text in system blocks and content blocks', () => {
		expect(
			find(rules, {
				system: [{ type: 'text', text: 'context ALPHA here' }],
			})?.file,
		).toBe('a.txt');
		expect(
			find(rules, {
				messages: [
					{ role: 'user', content: [{ type: 'text', text: 'BETA' }] },
				],
			})?.file,
		).toBe('b.txt');
	});

	test('matches text containing quotes and newlines', () => {
		const multi = [{ match: 'line one\n"quoted"', file: 'q.txt' }];
		const body = {
			messages: [{ role: 'user', content: 'x line one\n"quoted" y' }],
		};
		expect(find(multi, body)?.file).toBe('q.txt');
	});

	test('is case sensitive', () => {
		const body = { messages: [{ role: 'user', content: 'alpha' }] };
		expect(find(rules, body)).toBeUndefined();
	});

	test('does not match on JSON keys', () => {
		const keyed = [{ match: 'messages', file: 'k.txt' }];
		expect(find(keyed, { messages: [{ content: 'hi' }] })).toBeUndefined();
	});

	test('returns undefined for no rules, no match or no body', () => {
		expect(find([], { a: 'ALPHA' })).toBeUndefined();
		expect(find(rules, { a: 'nothing' })).toBeUndefined();
		expect(find(rules, undefined)).toBeUndefined();
	});
});

describe('loadRuleContent', () => {
	let dir: string;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-rules-'));
		mkdirSync(join(dir, 'nested'));
		writeFileSync(
			join(dir, 'nested', 'reply.json'),
			'{\n  "ok": true\n}\n',
		);
		writeFileSync(join(dir, 'a.txt'), 'reply a');
		writeFileSync(join(dir, 'b.txt'), 'reply b');
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('reads the file exactly as written, relative to the base dir', () => {
		const content = loadRuleContent(
			{ match: 'x', file: 'nested/reply.json' },
			dir,
		);
		expect(content).toBe('{\n  "ok": true\n}\n');
		expect(JSON.parse(content)).toEqual({ ok: true });
	});

	test('throws a clear error naming the path and rule when missing', () => {
		expect(() =>
			loadRuleContent({ match: 'MARKER', file: 'nope.txt' }, dir),
		).toThrow(/fixture file not found.*nope\.txt.*MARKER/);
	});

	test('picks at random from a rule with several files', () => {
		const rule = { match: 'x', files: ['a.txt', 'b.txt'] };
		const seen = new Set<string>();
		for (let i = 0; i < 60; i++) seen.add(loadRuleContent(rule, dir));

		expect(seen).toEqual(new Set(['reply a', 'reply b']));
	});

	test('a single entry in files always returns that file', () => {
		expect(loadRuleContent({ match: 'x', files: ['b.txt'] }, dir)).toBe(
			'reply b',
		);
	});
});

describe('ruleFiles and readRuleFile', () => {
	test('lists the single file or every file of a pool', () => {
		expect(ruleFiles({ match: 'x', file: 'a.txt' })).toEqual(['a.txt']);
		expect(ruleFiles({ match: 'x', files: ['a.txt', 'b.txt'] })).toEqual([
			'a.txt',
			'b.txt',
		]);
	});

	test('names the missing file of a pool and the rule', () => {
		const rule = { match: 'MARKER', files: ['a.txt', 'gone.txt'] };
		expect(() => readRuleFile(rule, 'gone.txt', tmpdir())).toThrow(
			/fixture file not found.*gone\.txt.*MARKER/,
		);
	});
});

describe('validateResponseRules', () => {
	test('treats undefined as no rules', () => {
		expect(validateResponseRules(undefined)).toEqual([]);
	});

	test('returns valid rules unchanged', () => {
		const rules = [{ match: 'a', file: 'b.txt' }];
		expect(validateResponseRules(rules)).toEqual(rules);
	});

	test('accepts a rule with a pool of files', () => {
		const rules = [{ match: 'a', files: ['b.txt', 'c.txt'] }];
		expect(validateResponseRules(rules)).toEqual(rules);
	});

	test.each([
		['not an array', { match: 'a', file: 'b' }, /must be an array/],
		['empty match', [{ match: '', file: 'b' }], /\[0\]\.match/],
		['missing match', [{ file: 'b' }], /\[0\]\.match/],
		['empty file', [{ match: 'a', file: '' }], /\[0\]\.file/],
		['non-string file', [{ match: 'a', file: 3 }], /\[0\]\.file/],
		['bad second rule', [{ match: 'a', file: 'b' }, null], /\[1\]\.match/],
		['neither file nor files', [{ match: 'a' }], /\[0\]\.file/],
		[
			'both file and files',
			[{ match: 'a', file: 'b', files: ['c'] }],
			/\[0\] must have either file or files/,
		],
		['files not an array', [{ match: 'a', files: 'b' }], /\[0\]\.files/],
		['empty files', [{ match: 'a', files: [] }], /\[0\]\.files/],
		['empty entry in files', [{ match: 'a', files: [''] }], /\[0\]\.files/],
		[
			'non-string in files',
			[{ match: 'a', files: ['b', 3] }],
			/\[0\]\.files/,
		],
	])('rejects %s', (_name, rules, message) => {
		expect(() => validateResponseRules(rules)).toThrow(message);
	});
});
