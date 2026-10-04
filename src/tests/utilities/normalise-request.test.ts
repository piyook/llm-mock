import { describe, expect, test } from 'vitest';
import { normaliseRequest } from '../../utilities/normalise-request.js';

describe('normaliseRequest (OpenAI)', () => {
	test('first turn: model, system and developer text, last user text', () => {
		const request = normaliseRequest({
			model: 'gpt-4o',
			messages: [
				{ role: 'system', content: 'be brief' },
				{ role: 'developer', content: 'use British spelling' },
				{ role: 'user', content: 'What is the weather in Paris?' },
			],
		});

		expect(request).toMatchObject({
			model: 'gpt-4o',
			systemText: 'be brief\nuse British spelling',
			lastUserText: 'What is the weather in Paris?',
			turnIndex: 0,
			hasToolResult: false,
		});
	});

	test('reads text from content parts and skips non-text parts', () => {
		const request = normaliseRequest({
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'describe this' },
						{
							type: 'image_url',
							image_url: { url: 'http://x/y.png' },
						},
						{ type: 'text', text: 'in one line' },
					],
				},
			],
		});

		expect(request.lastUserText).toBe('describe this\nin one line');
	});

	test('a tool message after the assistant turn is a tool result', () => {
		const request = normaliseRequest({
			model: 'gpt-4o',
			messages: [
				{ role: 'user', content: 'weather in Paris?' },
				{
					role: 'assistant',
					content: null,
					tool_calls: [
						{
							id: 'call_1',
							type: 'function',
							function: { name: 'get_weather', arguments: '{}' },
						},
					],
				},
				{ role: 'tool', tool_call_id: 'call_1', content: '18C' },
			],
		});

		expect(request.turnIndex).toBe(1);
		expect(request.hasToolResult).toBe(true);
		// The tool message is not a user message
		expect(request.lastUserText).toBe('weather in Paris?');
	});

	test('a tool result from an earlier turn no longer counts', () => {
		const request = normaliseRequest({
			messages: [
				{ role: 'user', content: 'weather in Paris?' },
				{ role: 'assistant', content: null, tool_calls: [] },
				{ role: 'tool', tool_call_id: 'call_1', content: '18C' },
				{ role: 'assistant', content: 'It is 18C.' },
				{ role: 'user', content: 'and Rome?' },
			],
		});

		expect(request.turnIndex).toBe(2);
		expect(request.hasToolResult).toBe(false);
		expect(request.lastUserText).toBe('and Rome?');
	});
});

describe('normaliseRequest (Claude)', () => {
	test('top-level system as a string or as text blocks', () => {
		const messages = [{ role: 'user', content: 'hi' }];

		expect(
			normaliseRequest({ system: 'be brief', messages }).systemText,
		).toBe('be brief');
		expect(
			normaliseRequest({
				system: [
					{ type: 'text', text: 'be brief' },
					{ type: 'text', text: 'be kind' },
				],
				messages,
			}).systemText,
		).toBe('be brief\nbe kind');
	});

	test('reads text blocks of the last user message', () => {
		const request = normaliseRequest({
			model: 'claude-opus-5-5',
			messages: [
				{ role: 'user', content: 'first' },
				{ role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
				{ role: 'user', content: [{ type: 'text', text: 'second' }] },
			],
		});

		expect(request).toMatchObject({
			model: 'claude-opus-5-5',
			lastUserText: 'second',
			turnIndex: 1,
			hasToolResult: false,
		});
	});

	test('a tool_result block is a tool result, not user text', () => {
		const request = normaliseRequest({
			messages: [
				{ role: 'user', content: 'weather in Paris?' },
				{
					role: 'assistant',
					content: [
						{
							type: 'tool_use',
							id: 'toolu_1',
							name: 'get_weather',
							input: { city: 'Paris' },
						},
					],
				},
				{
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: 'toolu_1',
							content: '18C',
						},
					],
				},
			],
		});

		expect(request.turnIndex).toBe(1);
		expect(request.hasToolResult).toBe(true);
		expect(request.lastUserText).toBe('weather in Paris?');
	});
});

describe('normaliseRequest (Gemini)', () => {
	test('contents, model role and systemInstruction', () => {
		const request = normaliseRequest({
			systemInstruction: { parts: [{ text: 'be brief' }] },
			contents: [
				{ role: 'user', parts: [{ text: 'first' }] },
				{ role: 'model', parts: [{ text: 'ok' }] },
				{ role: 'user', parts: [{ text: 'second' }, { text: 'line' }] },
			],
		});

		expect(request).toEqual({
			model: undefined,
			systemText: 'be brief',
			lastUserText: 'second\nline',
			turnIndex: 1,
			hasToolResult: false,
			allText: 'be brief\nuser\nfirst\nmodel\nok\nuser\nsecond\nline',
		});
	});

	test('accepts snake_case system_instruction and a turn without a role', () => {
		const request = normaliseRequest({
			system_instruction: { parts: [{ text: 'be brief' }] },
			contents: [{ parts: [{ text: 'hello' }] }],
		});

		expect(request.systemText).toBe('be brief');
		expect(request.lastUserText).toBe('hello');
	});

	test('a functionResponse part is a tool result', () => {
		const request = normaliseRequest({
			contents: [
				{ role: 'user', parts: [{ text: 'weather in Paris?' }] },
				{
					role: 'model',
					parts: [
						{
							functionCall: {
								name: 'get_weather',
								args: { city: 'Paris' },
							},
						},
					],
				},
				{
					role: 'user',
					parts: [
						{
							functionResponse: {
								name: 'get_weather',
								response: { temp: '18C' },
							},
						},
					],
				},
			],
		});

		expect(request.turnIndex).toBe(1);
		expect(request.hasToolResult).toBe(true);
		expect(request.lastUserText).toBe('weather in Paris?');
	});
});

describe('normaliseRequest (general)', () => {
	test('allText holds every string value, including earlier turns', () => {
		const { allText } = normaliseRequest({
			model: 'm',
			system: 'sys',
			messages: [
				{ role: 'user', content: 'early MARKER' },
				{ role: 'assistant', content: 'reply' },
				{ role: 'user', content: 'late' },
			],
		});

		expect(allText).toContain('early MARKER');
		expect(allText).toContain('sys');
		expect(allText).toContain('m');
	});

	test('yields empty fields for a missing or unrecognised body', () => {
		const empty = {
			model: undefined,
			systemText: '',
			lastUserText: '',
			turnIndex: 0,
			hasToolResult: false,
			allText: '',
		};

		expect(normaliseRequest(undefined)).toEqual(empty);
		expect(normaliseRequest(null)).toEqual(empty);
		expect(normaliseRequest({})).toEqual(empty);
		expect(normaliseRequest({ messages: 'nope' })).toEqual({
			...empty,
			allText: 'nope',
		});
		expect(normaliseRequest({ messages: [null, 'x', 42] })).toMatchObject({
			lastUserText: '',
			turnIndex: 0,
		});
	});
});
