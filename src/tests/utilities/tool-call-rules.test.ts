/* eslint-disable @typescript-eslint/naming-convention */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	loadRuleBlocks,
	readRuleContent,
	ruleFiles,
	ruleHasReply,
	ruleHasToolCalls,
	validateResponseRule,
	validateResponseRules,
} from '../../utilities/response-rules.js';
import {
	newToolUseId,
	splitInputJson,
	toReplyBlocks,
} from '../../utilities/tool-use.js';

const toolUse = {
	type: 'tool_use',
	name: 'get_weather',
	input: { city: 'Paris' },
};

const rule = (extra: Record<string, unknown>) => ({
	match: 'Weather?',
	...extra,
});

const check =
	(value: unknown, format = 'claude') =>
	() =>
		validateResponseRule(value, 'rule', format);

describe('a rule with content', () => {
	test('is accepted with tool_use blocks, a leading text block, an id and no input', () => {
		for (const content of [
			[toolUse],
			[{ type: 'text', text: 'Checking.' }, toolUse],
			[toolUse, { type: 'tool_use', name: 'get_time' }],
			[{ ...toolUse, id: 'toolu_fixed' }],
		]) {
			expect(check(rule({ content }))).not.toThrow();
		}
	});

	test('takes stopReason "tool_use" or none', () => {
		expect(
			check(rule({ content: [toolUse], stopReason: 'tool_use' })),
		).not.toThrow();
		expect(check(rule({ content: [toolUse], stopReason: 'end' }))).toThrow(
			/stopReason must be "tool_use" or left out/,
		);
	});

	test('can fail too', () => {
		expect(
			check(rule({ content: [toolUse], fail: { kind: 'stream-error' } })),
		).not.toThrow();
	});

	test.each([
		[
			'not an array',
			{ content: toolUse },
			/content must be a non-empty array/,
		],
		['empty', { content: [] }, /content must be a non-empty array/],
		[
			'a block that is not an object',
			{ content: ['x'] },
			/content\[0\] must be an object/,
		],
		[
			'an unknown block type',
			{ content: [{ type: 'image' }] },
			/type must be "text" or "tool_use"/,
		],
		[
			'only text',
			{ content: [{ type: 'text', text: 'hi' }] },
			/at least one tool_use block/,
		],
		[
			'text after a tool_use',
			{ content: [toolUse, { type: 'text', text: 'hi' }] },
			/text block can only be the first/,
		],
		[
			'two text blocks',
			{
				content: [
					{ type: 'text', text: 'a' },
					{ type: 'text', text: 'b' },
					toolUse,
				],
			},
			/text block can only be the first/,
		],
		[
			'text that is not a string',
			{ content: [{ type: 'text', text: 1 }, toolUse] },
			/content\[0\]\.text must be a string/,
		],
		[
			'a tool_use with no name',
			{ content: [{ type: 'tool_use', input: {} }] },
			/name must be a non-empty string/,
		],
		[
			'a tool_use with an empty name',
			{ content: [{ ...toolUse, name: '' }] },
			/name must be a non-empty string/,
		],
		[
			'input that is an array',
			{ content: [{ ...toolUse, input: [1] }] },
			/input must be a JSON object/,
		],
		[
			'input that is a string',
			{ content: [{ ...toolUse, input: '{}' }] },
			/input must be a JSON object/,
		],
		[
			'input that is null',
			{ content: [{ ...toolUse, input: null }] },
			/input must be a JSON object/,
		],
		[
			'an empty id',
			{ content: [{ ...toolUse, id: '' }] },
			/id must be a non-empty string/,
		],
		[
			'an unknown block key',
			{ content: [{ ...toolUse, args: {} }] },
			/unknown settings: args/,
		],
		['text as well', { content: [toolUse], text: 'x' }, /only one of/],
		[
			'a file as well',
			{ content: [toolUse], file: 'a.txt' },
			/only one of/,
		],
		[
			'a contentFile as well',
			{ content: [toolUse], contentFile: 'a.json' },
			/only one of/,
		],
	])('is refused with %s', (_name, extra, message) => {
		expect(check(rule(extra))).toThrow(message);
	});

	test('is refused for any format but claude', () => {
		expect(check(rule({ content: [toolUse] }), 'openai')).toThrow(
			/only for the claude format \(this preset is "openai"\)/,
		);
		expect(
			check(rule({ contentFile: 'steps/one.json' }), 'gemini'),
		).toThrow(/only for the claude format/);
		expect(() =>
			validateResponseRules([rule({ content: [toolUse] })], 'openai'),
		).toThrow(/responseRules\[0\]: content and contentFile/);
	});
});

describe('stopReason "tool_use"', () => {
	test('is refused on a rule with no tool calls', () => {
		expect(check(rule({ text: 'x', stopReason: 'tool_use' }))).toThrow(
			/"tool_use" needs content or contentFile/,
		);
	});

	test('is listed with the other stop reasons when one is unknown', () => {
		expect(check(rule({ text: 'x', stopReason: 'stop' }))).toThrow(
			'end, max_tokens, refusal, tool_use',
		);
	});
});

describe('a rule with contentFile', () => {
	let dir: string;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-tool-rules-'));
		writeFileSync(join(dir, 'step.json'), JSON.stringify([toolUse]));
		writeFileSync(join(dir, 'broken.json'), '[{"type": "tool_use",');
		writeFileSync(
			join(dir, 'no-tool.json'),
			'[{"type":"text","text":"x"}]',
		);
	});

	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	test('needs a non-empty path', () => {
		expect(check(rule({ contentFile: '' }))).toThrow(
			/contentFile must be a non-empty string/,
		);
		expect(check(rule({ contentFile: 'step.json' }))).not.toThrow();
	});

	test('is a file of the rule, and a reply of its own', () => {
		const withFile = rule({ contentFile: 'step.json' }) as any;
		expect(ruleFiles(withFile)).toEqual(['step.json']);
		expect(ruleHasReply(withFile)).toBe(true);
		expect(ruleHasToolCalls(withFile)).toBe(true);
		expect(ruleHasToolCalls(rule({ text: 'x' }) as any)).toBe(false);
	});

	test('is read and checked', () => {
		expect(
			readRuleContent(rule({ contentFile: 'step.json' }) as any, dir),
		).toEqual([toolUse]);
	});

	test('names the file and rule when it is not valid JSON or not valid blocks', () => {
		expect(() =>
			readRuleContent(rule({ contentFile: 'broken.json' }) as any, dir),
		).toThrow(/not valid JSON: .*broken\.json \(rule match: "Weather\?"\)/);
		expect(() =>
			readRuleContent(rule({ contentFile: 'no-tool.json' }) as any, dir),
		).toThrow(/contentFile no-tool\.json must have at least one tool_use/);
		expect(() =>
			readRuleContent(rule({ contentFile: 'missing.json' }) as any, dir),
		).toThrow(/not found or unreadable/);
	});
});

describe('the blocks a reply sends', () => {
	test('a tool_use without an id gets a new toolu_ id on every reply', () => {
		const content = [{ type: 'text', text: 'Checking.' }, toolUse] as any;
		const first = loadRuleBlocks(rule({ content }) as any, '.');
		const second = loadRuleBlocks(rule({ content }) as any, '.');

		expect(first[0]).toEqual({ type: 'text', text: 'Checking.' });
		expect(first[1]).toMatchObject({ ...toolUse });
		const ids = [first[1], second[1]].map((block: any) => block.id);
		for (const id of ids) expect(id).toMatch(/^toolu_01[A-Za-z0-9]{22}$/);
		expect(ids[0]).not.toBe(ids[1]);
	});

	test('two tool_use blocks in one reply get different ids', () => {
		const blocks = toReplyBlocks([toolUse, toolUse] as any);
		expect((blocks[0] as any).id).not.toBe((blocks[1] as any).id);
	});

	test('an id given by the rule is kept, and a missing input is {}', () => {
		const [block] = toReplyBlocks([
			{ type: 'tool_use', id: 'toolu_fixed', name: 'get_time' },
		]);
		expect(block).toEqual({
			type: 'tool_use',
			id: 'toolu_fixed',
			name: 'get_time',
			input: {},
		});
	});

	test('the input sent is a copy, so a reply can not change the rule', () => {
		const content = [{ ...toolUse, input: { city: 'Paris' } }] as any;
		const [block] = toReplyBlocks(content) as any;
		block.input.city = 'Rome';
		expect(content[0].input.city).toBe('Paris');
	});

	test('newToolUseId is unique', () => {
		const ids = new Set(Array.from({ length: 50 }, newToolUseId));
		expect(ids.size).toBe(50);
	});
});

describe('splitInputJson', () => {
	test('splits into a few pieces that join back to the JSON', () => {
		const json = JSON.stringify({
			city: 'Paris',
			units: 'metric',
			days: 3,
		});
		const pieces = splitInputJson(json);
		expect(pieces.length).toBe(3);
		expect(pieces.join('')).toBe(json);
	});

	test('sends {} as one piece', () => {
		expect(splitInputJson('{}')).toEqual(['{}']);
	});
});
