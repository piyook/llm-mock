/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, test } from 'vitest';
import {
	estimateOpenAiUsage,
	resolveOpenAiModel,
	wantsStreamUsage,
} from '../../utilities/build-openai-response.js';
import { buildStaticResponse } from '../../utilities/response-helpers.js';
import { setTestEnvironmentVariables } from '../test-config-helper.js';

const body = {
	model: 'gpt-5-mini',
	messages: [{ role: 'user', content: 'Hello, how are you?' }],
};

describe('openai reply fields', () => {
	beforeEach(() => {
		setTestEnvironmentVariables();
		process.env.LLM_NAME = 'openai';
		process.env.LLM_MODEL = 'gpt-4o';
	});

	test('the request model wins, else the preset model', () => {
		expect(resolveOpenAiModel(body)).toBe('gpt-5-mini');
		expect(resolveOpenAiModel({ messages: [] })).toBe('gpt-4o');
		expect(resolveOpenAiModel({ model: '' })).toBe('gpt-4o');
		expect(resolveOpenAiModel({ model: 42 })).toBe('gpt-4o');
		expect(resolveOpenAiModel(undefined)).toBe('gpt-4o');
	});

	test('usage is estimated from the messages and the reply', () => {
		const usage = estimateOpenAiUsage(body, 'I am fine, thank you.');
		const prompt = Math.ceil(JSON.stringify(body.messages).length / 4);

		expect(usage).toEqual({
			prompt_tokens: prompt,
			completion_tokens: 6,
			total_tokens: prompt + 6,
		});
	});

	test('include_usage only when it is true', () => {
		expect(
			wantsStreamUsage({ stream_options: { include_usage: true } }),
		).toBe(true);
		expect(
			wantsStreamUsage({ stream_options: { include_usage: 'true' } }),
		).toBe(false);
		expect(wantsStreamUsage({ stream_options: {} })).toBe(false);
		expect(wantsStreamUsage({})).toBe(false);
		expect(wantsStreamUsage(undefined)).toBe(false);
	});

	test('a static reply echoes the model and estimates usage', async () => {
		const reply = (await buildStaticResponse(
			{ text: 'I am fine, thank you.' },
			body,
		)) as any;

		expect(reply.model).toBe('gpt-5-mini');
		expect(reply.usage).toEqual(
			estimateOpenAiUsage(body, 'I am fine, thank you.'),
		);
		expect(reply.choices[0].message.content).toBe('I am fine, thank you.');
		// The template's other fields are kept, in the same order
		expect(Object.keys(reply)).toEqual([
			'id',
			'object',
			'created',
			'model',
			'usage',
			'choices',
		]);
	});

	test('a GET (no body) gets the preset model', async () => {
		const reply = (await buildStaticResponse({ text: 'Hi' })) as any;

		expect(reply.model).toBe('gpt-4o');
		expect(reply.usage.completion_tokens).toBe(1);
	});

	test('other formats keep their template', async () => {
		process.env.LLM_NAME = 'gemini';
		const reply = (await buildStaticResponse({ text: 'Hi' }, body)) as any;

		expect(JSON.stringify(reply)).not.toContain('gpt-5-mini');
	});
});
