import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	collectStrings,
	findMatchingRule,
	loadRuleContent,
	validateResponseRules,
} from '../../utilities/response-rules.js';

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
	const rules = [
		{ match: 'ALPHA', file: 'a.txt' },
		{ match: 'BETA', file: 'b.txt' },
	];

	test('returns the rule whose text appears in the request', () => {
		const body = { messages: [{ role: 'user', content: 'say BETA now' }] };
		expect(findMatchingRule(rules, body)?.file).toBe('b.txt');
	});

	test('first matching rule in config order wins', () => {
		const body = {
			messages: [{ role: 'user', content: 'BETA and ALPHA' }],
		};
		expect(findMatchingRule(rules, body)?.file).toBe('a.txt');
	});

	test('matches text in system blocks and content blocks', () => {
		expect(
			findMatchingRule(rules, {
				system: [{ type: 'text', text: 'context ALPHA here' }],
			})?.file,
		).toBe('a.txt');
		expect(
			findMatchingRule(rules, {
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
		expect(findMatchingRule(multi, body)?.file).toBe('q.txt');
	});

	test('is case sensitive', () => {
		const body = { messages: [{ role: 'user', content: 'alpha' }] };
		expect(findMatchingRule(rules, body)).toBeUndefined();
	});

	test('does not match on JSON keys', () => {
		const keyed = [{ match: 'messages', file: 'k.txt' }];
		expect(
			findMatchingRule(keyed, { messages: [{ content: 'hi' }] }),
		).toBeUndefined();
	});

	test('returns undefined for no rules, no match or no body', () => {
		expect(findMatchingRule([], { a: 'ALPHA' })).toBeUndefined();
		expect(findMatchingRule(rules, { a: 'nothing' })).toBeUndefined();
		expect(findMatchingRule(rules, undefined)).toBeUndefined();
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
});

describe('validateResponseRules', () => {
	test('treats undefined as no rules', () => {
		expect(validateResponseRules(undefined)).toEqual([]);
	});

	test('returns valid rules unchanged', () => {
		const rules = [{ match: 'a', file: 'b.txt' }];
		expect(validateResponseRules(rules)).toEqual(rules);
	});

	test.each([
		['not an array', { match: 'a', file: 'b' }, /must be an array/],
		['empty match', [{ match: '', file: 'b' }], /\[0\]\.match/],
		['missing match', [{ file: 'b' }], /\[0\]\.match/],
		['empty file', [{ match: 'a', file: '' }], /\[0\]\.file/],
		['non-string file', [{ match: 'a', file: 3 }], /\[0\]\.file/],
		['bad second rule', [{ match: 'a', file: 'b' }, null], /\[1\]\.match/],
	])('rejects %s', (_name, rules, message) => {
		expect(() => validateResponseRules(rules)).toThrow(message);
	});
});
