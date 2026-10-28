/* eslint-disable @typescript-eslint/naming-convention */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';

// A tool-call rule's reply through the real chat route, in the claude format

// Eight words, so eight text deltas
const textReply = 'Let me look that order up for you.';

const lookupBlock = {
	type: 'tool_use',
	name: 'lookup_order',
	input: { order_id: 'A-1001', fields: ['status', 'eta'] },
};

describe('a tool-call reply', () => {
	let dir: string;
	let app: FastifyInstance;
	const previousEnv = { ...process.env };

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-tool-replies-'));
		mkdirSync(join(dir, 'fixtures'));
		writeFileSync(
			join(dir, 'fixtures', 'two-tools.json'),
			JSON.stringify([
				{
					type: 'tool_use',
					name: 'get_weather',
					input: { city: 'Paris' },
				},
				{
					type: 'tool_use',
					id: 'toolu_given',
					name: 'get_time',
					input: {},
				},
			]),
		);

		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'tools',
				models: {
					tools: {
						name: 'claude',
						endpoint: 'chat',
						responseRules: [
							{
								match: 'WANT_TEXT_AND_TOOL',
								content: [
									{ type: 'text', text: textReply },
									lookupBlock,
								],
							},
							{
								match: 'WANT_FAIL_AFTER_9',
								content: [
									{ type: 'text', text: textReply },
									lookupBlock,
								],
								fail: {
									kind: 'stream-error',
									status: 529,
									afterChunks: 9,
								},
							},
							{
								match: 'WANT_FILE',
								contentFile: 'fixtures/two-tools.json',
								stopReason: 'tool_use',
							},
						],
					},
				},
				server: { port: 8001, host: '0.0.0.0' },
			}),
		);

		loadConfig(configPath);
		Object.assign(process.env, {
			LLM_MODEL_NAME: 'tools',
			LLM_NAME: 'claude',
			LLM_URL_ENDPOINT: 'chat',
			MOCK_LLM_RESPONSE_TYPE: 'lorem',
			VALIDATE_REQUESTS: 'OFF',
			LOG_REQUESTS: 'OFF',
			RESPONSE_DELAY_MIN: '0',
			RESPONSE_DELAY_MAX: '0',
			CHAOS_ENABLED: 'false',
		});

		const { default: handler } =
			await import('../../api/completions/api.js');
		app = fastify({ logger: false });
		handler(app, 'chat');
	});

	afterAll(async () => {
		await app.close();
		rmSync(dir, { recursive: true, force: true });
		process.env = previousEnv;
	});

	const post = (marker: string, stream = false) =>
		app.inject({
			method: 'POST',
			url: '/chat',
			payload: {
				model: 'claude-test',
				max_tokens: 64,
				stream,
				messages: [{ role: 'user', content: marker }],
			},
		});

	// The JSON of every `data:` line of an SSE body
	const streamData = (payload: string): any[] =>
		payload
			.split('\n')
			.filter((line) => line.startsWith('data: {'))
			.map((line) => JSON.parse(line.slice('data: '.length)));

	describe('streamed', () => {
		test('sends the blocks as the API streams them, ending with tool_use', async () => {
			const response = await post('WANT_TEXT_AND_TOOL', true);
			const events = streamData(response.payload);

			expect(response.headers['content-type']).toBe('text/event-stream');
			expect(events[0].type).toBe('message_start');
			expect(events.at(-2)).toMatchObject({
				type: 'message_delta',
				delta: { stop_reason: 'tool_use', stop_sequence: null },
			});
			expect(events.at(-1).type).toBe('message_stop');

			const start = events.find(
				(e) => e.type === 'content_block_start' && e.index === 1,
			);
			expect(start.content_block).toEqual({
				type: 'tool_use',
				id: expect.stringMatching(/^toolu_01/),
				name: 'lookup_order',
				input: {},
			});

			const deltas = (index: number) =>
				events.filter(
					(e) =>
						e.type === 'content_block_delta' && e.index === index,
				);
			expect(
				deltas(0)
					.map((e) => e.delta.text)
					.join(''),
			).toBe(textReply);
			expect(
				JSON.parse(
					deltas(1)
						.map((e) => e.delta.partial_json)
						.join(''),
				),
			).toEqual(lookupBlock.input);
		});

		test('a stream-* failure counts input_json_delta events as deltas', async () => {
			const response = await post('WANT_FAIL_AFTER_9', true);
			const events = streamData(response.payload);
			const deltas = events.filter(
				(e) => e.type === 'content_block_delta',
			);

			expect(response.headers['x-llmock-chaos']).toBe('true');
			expect(deltas.map((e) => e.delta.type)).toEqual([
				...Array.from({ length: 8 }, () => 'text_delta'),
				'input_json_delta',
			]);
			// The text block closed and the tool_use opened before the cut
			expect(
				events.filter((e) => e.type === 'content_block_start'),
			).toHaveLength(2);
			expect(events.at(-1)).toEqual({
				type: 'error',
				error: {
					type: 'overloaded_error',
					message: 'llmock chaos: simulated 529 error',
				},
			});
			expect(events.some((e) => e.type === 'message_delta')).toBe(false);
		});

		test('a failing rule that is not streamed gets the HTTP error', async () => {
			const response = await post('WANT_FAIL_AFTER_9');
			expect(response.statusCode).toBe(529);
		});
	});

	describe('not streamed', () => {
		test('sends the text and tool_use blocks with stop_reason tool_use', async () => {
			const body = (await post('WANT_TEXT_AND_TOOL')).json();

			expect(body).toMatchObject({
				type: 'message',
				role: 'assistant',
				model: 'claude-test',
				stop_reason: 'tool_use',
				stop_sequence: null,
			});
			expect(body.id).toMatch(/^msg_/);
			expect(body).not.toHaveProperty('stop_details');
			expect(body.content).toEqual([
				{ type: 'text', text: 'Let me look that order up for you.' },
				{ ...lookupBlock, id: expect.stringMatching(/^toolu_01/) },
			]);
			expect(body.usage.output_tokens).toBeGreaterThan(1);
		});

		test('gives each reply a new tool_use id', async () => {
			const ids = await Promise.all(
				[1, 2].map(async () => {
					const body = (await post('WANT_TEXT_AND_TOOL')).json();
					return body.content[1].id;
				}),
			);
			expect(ids[0]).not.toBe(ids[1]);
		});

		test('reads a contentFile, in order, keeping a given id', async () => {
			const body = (await post('WANT_FILE')).json();

			expect(body.stop_reason).toBe('tool_use');
			expect(body.content).toEqual([
				{
					type: 'tool_use',
					id: expect.stringMatching(/^toolu_01/),
					name: 'get_weather',
					input: { city: 'Paris' },
				},
				{
					type: 'tool_use',
					id: 'toolu_given',
					name: 'get_time',
					input: {},
				},
			]);
		});

		test('a contentFile that has become invalid fails the request', async () => {
			writeFileSync(join(dir, 'fixtures', 'two-tools.json'), '[');
			try {
				const response = await post('WANT_FILE');
				expect(response.statusCode).toBe(500);
			} finally {
				writeFileSync(
					join(dir, 'fixtures', 'two-tools.json'),
					JSON.stringify([lookupBlock]),
				);
			}
		});
	});
});
