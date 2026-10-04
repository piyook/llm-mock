/* eslint-disable  @typescript-eslint/naming-convention */
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from 'vitest';
import {
	buildClaudeStaticResponse,
	estimateInputTokens,
	estimateTokens,
	newClaudeMessageId,
} from '../../utilities/build-claude-response.js';

describe('buildClaudeStaticResponse', () => {
	const previousName = process.env.LLM_NAME;
	const previousModel = process.env.LLM_MODEL;

	beforeAll(() => {
		process.env.LLM_NAME = 'claude';
	});

	beforeEach(() => {
		delete process.env.LLM_MODEL;
	});

	afterAll(() => {
		for (const [key, value] of [
			['LLM_NAME', previousName],
			['LLM_MODEL', previousModel],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	test('returns an assistant message with the content in one text block', async () => {
		const response = await buildClaudeStaticResponse({
			text: 'Hello there.',
		});

		expect(response).toMatchObject({
			type: 'message',
			role: 'assistant',
			content: [{ type: 'text', text: 'Hello there.' }],
			stop_reason: 'end_turn',
			stop_sequence: null,
		});
	});

	test('does not include non-API fields from the template', async () => {
		const response = await buildClaudeStaticResponse({ text: 'x' });

		expect(response).not.toHaveProperty('created_at');
	});

	test('gives every response a unique msg_ id', async () => {
		const first = await buildClaudeStaticResponse({ text: 'x' });
		const second = await buildClaudeStaticResponse({ text: 'x' });

		expect(first.id).toMatch(/^msg_[A-Za-z0-9]{24}$/);
		expect(second.id).toMatch(/^msg_[A-Za-z0-9]{24}$/);
		expect(first.id).not.toBe(second.id);
	});

	test('echoes the requested model', async () => {
		const response = await buildClaudeStaticResponse(
			{ text: 'x' },
			{
				model: 'claude-test-model',
			},
		);

		expect(response.model).toBe('claude-test-model');
	});

	test('falls back to the preset model, then the template default', async () => {
		process.env.LLM_MODEL = 'claude-preset';
		expect((await buildClaudeStaticResponse({ text: 'x' }, {})).model).toBe(
			'claude-preset',
		);

		delete process.env.LLM_MODEL;
		expect((await buildClaudeStaticResponse({ text: 'x' })).model).toBe(
			'claude-opus-5-5',
		);
	});

	test('reports estimated token usage', async () => {
		const body = { messages: [{ role: 'user', content: 'How are you?' }] };
		const content = 'Fine thanks, and you?';

		const { usage } = await buildClaudeStaticResponse(
			{ text: content },
			body,
		);

		expect(usage).toEqual({
			input_tokens: estimateInputTokens(body),
			output_tokens: estimateTokens(content),
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
		});
	});

	test('keeps content exactly as generated, including newlines', async () => {
		const content = '{\n  "a": 1\n}\n';
		const response = await buildClaudeStaticResponse({ text: content });

		expect((response.content as { text: string }[])[0].text).toBe(content);
	});
});

describe('token estimates', () => {
	test('estimateTokens is roughly one token per four characters, minimum 1', () => {
		expect(estimateTokens('')).toBe(1);
		expect(estimateTokens('abcd')).toBe(1);
		expect(estimateTokens('abcde')).toBe(2);
		expect(estimateTokens('a'.repeat(400))).toBe(100);
	});

	test('estimateTokens accepts non-string values', () => {
		expect(estimateTokens({ a: 1 })).toBe(
			Math.ceil(JSON.stringify({ a: 1 }).length / 4),
		);
	});

	test('estimateInputTokens uses the messages and tolerates a missing body', () => {
		const messages = [{ role: 'user', content: 'hello' }];

		expect(estimateInputTokens({ messages })).toBe(
			estimateTokens(messages),
		);
		expect(estimateInputTokens(undefined)).toBe(1);
		expect(estimateInputTokens({})).toBe(1);
	});
});

describe('newClaudeMessageId', () => {
	test('matches the Anthropic message id shape', () => {
		expect(newClaudeMessageId()).toMatch(/^msg_[A-Za-z0-9]{24}$/);
	});
});
