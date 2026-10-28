/* eslint-disable  @typescript-eslint/naming-convention */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { validateRequest } from '../../utilities/validate-request.js';

// Body shaped like what the Anthropic SDK sends: no temperature or stream
// key is guaranteed, and optional extras (system, output_config) are present.
const sdkBody = {
	model: 'claude-opus-5-5',
	max_tokens: 2000,
	system: [{ type: 'text', text: 'You are a helpful assistant.' }],
	messages: [{ role: 'user', content: 'Hello' }],
	output_config: { effort: 'medium' },
	stream: true,
};

describe('claude request validation', () => {
	const previous = {
		validate: process.env.VALIDATE_REQUESTS,
		log: process.env.LOG_REQUESTS,
		name: process.env.LLM_NAME,
	};

	beforeAll(() => {
		process.env.VALIDATE_REQUESTS = 'ON';
		process.env.LOG_REQUESTS = 'OFF';
		process.env.LLM_NAME = 'claude';
	});

	afterAll(() => {
		for (const [key, value] of [
			['VALIDATE_REQUESTS', previous.validate],
			['LOG_REQUESTS', previous.log],
			['LLM_NAME', previous.name],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	test('accepts a request as sent by the Anthropic SDK', async () => {
		expect(await validateRequest({ body: sdkBody } as any)).toBe(true);
	});

	test('accepts a minimal request without temperature or stream', async () => {
		const { model, max_tokens, messages } = sdkBody;
		const body = { model, max_tokens, messages };
		expect(await validateRequest({ body } as any)).toBe(true);
	});

	// A manual tool loop sends the tools, the assistant's tool_use turn and a
	// user turn of tool_result blocks. Only top-level keys are checked, so
	// none of these is refused.
	test('accepts every request of a manual tool loop', async () => {
		const tools = [
			{
				name: 'get_weather',
				description: 'Current weather for a city',
				input_schema: {
					type: 'object',
					properties: { city: { type: 'string' } },
					required: ['city'],
				},
			},
		];
		const first = { role: 'user', content: 'Weather in Paris and Rome?' };
		const toolTurn = {
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Checking both.' },
				{
					type: 'tool_use',
					id: 'toolu_01abc',
					name: 'get_weather',
					input: { city: 'Paris' },
				},
				{
					type: 'tool_use',
					id: 'toolu_01def',
					name: 'get_weather',
					input: { city: 'Rome' },
				},
			],
		};
		const results = {
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: 'toolu_01abc',
					content: '18C',
				},
				{
					type: 'tool_result',
					tool_use_id: 'toolu_01def',
					content: [{ type: 'text', text: 'unavailable' }],
					is_error: true,
				},
			],
		};

		for (const messages of [[first], [first, toolTurn, results]]) {
			const body = {
				model: 'claude-opus-5-5',
				max_tokens: 1024,
				tools,
				tool_choice: { type: 'auto' },
				messages,
			};
			expect(await validateRequest({ body } as any)).toBe(true);
		}
	});

	test.each(['model', 'max_tokens', 'messages'] as const)(
		'rejects a request missing %s',
		async (key) => {
			const body: Record<string, unknown> = { ...sdkBody };
			delete body[key];
			expect(await validateRequest({ body } as any)).toBe(false);
		},
	);
});
