/* eslint-disable @typescript-eslint/naming-convention */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';

// A manual tool loop, written the way an app using the Anthropic SDK writes
// one, run against the mock: call the model, run the tool_use blocks, send
// the tool_result blocks back, until the turn ends. Each step's reply comes
// from a rule keyed on the last message with "in": "last".

const tools: Anthropic.Tool[] = [
	{
		name: 'get_weather',
		description: 'Current weather for a city',
		input_schema: {
			type: 'object',
			properties: { city: { type: 'string' } },
			required: ['city'],
		},
	},
	{
		name: 'find_park',
		description: 'A park in a city',
		input_schema: {
			type: 'object',
			properties: {
				city: { type: 'string' },
				shade: { type: 'boolean' },
			},
			required: ['city'],
		},
	},
];

// The tools the loop runs, with what each returns
const runTool = (block: Anthropic.ToolUseBlock): string => {
	const input = block.input as { city: string };
	if (block.name === 'get_weather') return `sunny in ${input.city}, 24C`;
	if (block.name === 'find_park') return `park found in ${input.city}`;
	throw new Error(`unknown tool ${block.name}`);
};

describe('a manual tool loop with the Anthropic SDK', () => {
	let dir: string;
	let app: FastifyInstance;
	let client: Anthropic;
	const previousEnv = { ...process.env };

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-sdk-loop-'));
		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'claude',
				models: {
					claude: {
						name: 'claude',
						endpoint: 'v1/messages',
						responseRules: [
							// A stream cut part-way through a tool's input
							{
								match: 'FAIL_MID_TOOL',
								content: [
									{
										type: 'tool_use',
										name: 'get_weather',
										input: {
											city: 'Paris',
											units: 'metric',
										},
									},
								],
								fail: {
									kind: 'stream-error',
									status: 529,
									afterChunks: 1,
								},
							},
							// Step 1: the question asks for the weather
							{
								match: 'Plan a picnic in Paris',
								in: 'last',
								content: [
									{
										type: 'text',
										text: 'Let me check the weather first.',
									},
									{
										type: 'tool_use',
										name: 'get_weather',
										input: { city: 'Paris' },
									},
								],
							},
							// Step 2: the weather result asks for two parks at once
							{
								match: 'sunny in Paris',
								in: 'last',
								content: [
									{
										type: 'tool_use',
										name: 'find_park',
										input: { city: 'Paris', shade: true },
									},
									{
										type: 'tool_use',
										name: 'find_park',
										input: {
											city: 'Versailles',
											shade: false,
										},
									},
								],
							},
							// Step 3: the park results end the turn
							{
								match: 'park found in Versailles',
								in: 'last',
								text: 'Take the picnic to a park: it will be sunny.',
							},
						],
					},
				},
				server: { port: 8001, host: '127.0.0.1' },
			}),
		);

		loadConfig(configPath);
		Object.assign(process.env, {
			LLM_MODEL_NAME: 'claude',
			LLM_NAME: 'claude',
			LLM_URL_ENDPOINT: 'v1/messages',
			MOCK_LLM_RESPONSE_TYPE: 'lorem',
			VALIDATE_REQUESTS: 'ON',
			LOG_REQUESTS: 'OFF',
			RESPONSE_DELAY_MIN: '0',
			RESPONSE_DELAY_MAX: '0',
			CHAOS_ENABLED: 'false',
		});

		const { default: handler } =
			await import('../../api/completions/api.js');
		app = fastify({ logger: false });
		handler(app, 'v1/messages');
		await app.listen({ port: 0, host: '127.0.0.1' });

		const { port } = app.server.address() as { port: number };
		client = new Anthropic({
			apiKey: 'mock',
			baseURL: `http://127.0.0.1:${port}`,
			maxRetries: 0,
		});
	});

	afterAll(async () => {
		await app.close();
		rmSync(dir, { recursive: true, force: true });
		process.env = previousEnv;
	});

	// Runs the loop, getting each reply with `call`; returns every reply
	const runLoop = async (
		call: (
			params: Anthropic.MessageCreateParamsNonStreaming,
		) => Promise<Anthropic.Message>,
	) => {
		const messages: Anthropic.MessageParam[] = [
			{ role: 'user', content: 'Plan a picnic in Paris' },
		];
		const replies: Anthropic.Message[] = [];

		for (let step = 0; step < 5; step++) {
			const reply = await call({
				model: 'claude-opus-5-5',
				max_tokens: 1024,
				tools,
				messages,
			});
			replies.push(reply);
			if (reply.stop_reason !== 'tool_use') break;

			messages.push({ role: 'assistant', content: reply.content });
			messages.push({
				role: 'user',
				content: reply.content
					.filter((block) => block.type === 'tool_use')
					.map((block) => ({
						type: 'tool_result' as const,
						tool_use_id: block.id,
						content: runTool(block),
					})),
			});
		}

		return replies;
	};

	// The shape of each step: its stop reason and its blocks, ids left out
	const shapeOf = (replies: Anthropic.Message[]) =>
		replies.map((reply) => ({
			stop_reason: reply.stop_reason,
			content: reply.content.map((block) =>
				block.type === 'tool_use'
					? { type: block.type, name: block.name, input: block.input }
					: block,
			),
		}));

	const expectedSteps = [
		{
			stop_reason: 'tool_use',
			content: [
				{ type: 'text', text: 'Let me check the weather first.' },
				{
					type: 'tool_use',
					name: 'get_weather',
					input: { city: 'Paris' },
				},
			],
		},
		{
			stop_reason: 'tool_use',
			content: [
				{
					type: 'tool_use',
					name: 'find_park',
					input: { city: 'Paris', shade: true },
				},
				{
					type: 'tool_use',
					name: 'find_park',
					input: { city: 'Versailles', shade: false },
				},
			],
		},
		{
			stop_reason: 'end_turn',
			content: [
				{
					type: 'text',
					text: 'Take the picnic to a park: it will be sunny.',
				},
			],
		},
	];

	test('messages.create runs each step to the end of the turn', async () => {
		const replies = await runLoop((params) =>
			client.messages.create(params),
		);

		expect(shapeOf(replies)).toEqual(expectedSteps);
		for (const reply of replies) {
			for (const block of reply.content) {
				if (block.type === 'tool_use') {
					expect(block.id).toMatch(/^toolu_01/);
				}
			}
		}
	});

	test('messages.stream().finalMessage() rebuilds the same blocks', async () => {
		const replies = await runLoop((params) =>
			client.messages.stream(params).finalMessage(),
		);

		expect(shapeOf(replies)).toEqual(expectedSteps);
		// Both tool_use blocks of a step have their own id
		const [a, b] = replies[1].content as Anthropic.ToolUseBlock[];
		expect(a.id).not.toBe(b.id);
	});

	test('the stream reports the input JSON as it arrives', async () => {
		const stream = client.messages.stream({
			model: 'claude-opus-5-5',
			max_tokens: 1024,
			tools,
			messages: [{ role: 'user', content: 'Plan a picnic in Paris' }],
		});
		const pieces: string[] = [];
		let text = '';
		stream.on('inputJson', (partial) => pieces.push(partial));
		stream.on('text', (delta) => (text += delta));

		const message = await stream.finalMessage();
		const tool = message.content[1] as Anthropic.ToolUseBlock;

		expect(text).toBe('Let me check the weather first.');
		expect(pieces.length).toBeGreaterThan(1);
		expect(JSON.parse(pieces.join(''))).toEqual(tool.input);
		expect(message.stop_reason).toBe('tool_use');
	});

	test('a stream that fails part-way through a tool input throws', async () => {
		const stream = client.messages.stream({
			model: 'claude-opus-5-5',
			max_tokens: 1024,
			tools,
			messages: [{ role: 'user', content: 'FAIL_MID_TOOL' }],
		});

		await expect(stream.finalMessage()).rejects.toThrow(
			/overloaded_error|529/,
		);
	});
});
