/* eslint-disable  @typescript-eslint/naming-convention */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import {
	applyStopReason,
	isStopReason,
	toWireStopReason,
	type StopReason,
} from '../../utilities/stop-reason.js';
import { generateResponseContent } from '../../utilities/response-helpers.js';

describe('toWireStopReason', () => {
	test.each([
		['claude', 'end', 'end_turn'],
		['claude', 'max_tokens', 'max_tokens'],
		['claude', 'refusal', 'refusal'],
		['openai', 'end', 'stop'],
		['openai', 'max_tokens', 'length'],
		['openai', 'refusal', 'content_filter'],
		['gemini', 'end', 'STOP'],
		['gemini', 'max_tokens', 'MAX_TOKENS'],
		['gemini', 'refusal', 'SAFETY'],
		['my-llm', 'max_tokens', 'length'],
		[undefined, 'refusal', 'content_filter'],
	] as const)('%s: %s is sent as %s', (llmName, stopReason, wire) => {
		expect(toWireStopReason(llmName, stopReason)).toBe(wire);
	});
});

describe('isStopReason', () => {
	test('accepts only the three stop reasons', () => {
		for (const value of ['end', 'max_tokens', 'refusal']) {
			expect(isStopReason(value)).toBe(true);
		}
		for (const value of ['stop', 'END', '', null, undefined, 3]) {
			expect(isStopReason(value)).toBe(false);
		}
	});
});

describe('applyStopReason', () => {
	test('returns the response itself for a reply that ends normally', () => {
		const response = { stop_reason: 'from the template' };

		expect(applyStopReason(response, 'claude', undefined)).toBe(response);
		expect(applyStopReason(response, 'claude', 'end')).toBe(response);
	});

	test('leaves a custom template with no choices list alone', () => {
		const response = { output: 'text' };

		expect(applyStopReason(response, 'my-llm', 'max_tokens')).toBe(
			response,
		);
	});

	test('sets every choice of an openai-shaped response', () => {
		expect(
			applyStopReason(
				{
					choices: [
						{ index: 0, finish_reason: 'stop' },
						{ index: 1, finish_reason: 'stop' },
					],
				},
				'my-llm',
				'refusal',
			),
		).toEqual({
			choices: [
				{ index: 0, finish_reason: 'content_filter' },
				{ index: 1, finish_reason: 'content_filter' },
			],
		});
	});
});

// Each stop reason, through the real chat route, in each wire format
describe('a response rule with a stopReason', () => {
	let dir: string;
	let app: FastifyInstance;
	const previousEnv = { ...process.env };

	const fixture = 'A reply that was cut off part-way through a sen';

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-stop-reason-'));
		mkdirSync(join(dir, 'fixtures'));
		writeFileSync(join(dir, 'fixtures', 'reply.txt'), fixture);
		writeFileSync(join(dir, 'fixtures', 'other.txt'), fixture);

		const reply = { file: 'fixtures/reply.txt' };
		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'rules',
				models: {
					rules: {
						name: 'claude',
						endpoint: 'chat',
						responseRules: [
							{ match: 'WANT_NONE', ...reply },
							{ match: 'WANT_END', ...reply, stopReason: 'end' },
							{
								match: 'WANT_MAX_TOKENS',
								...reply,
								stopReason: 'max_tokens',
							},
							{
								match: 'WANT_REFUSAL',
								...reply,
								stopReason: 'refusal',
							},
							{
								match: 'WANT_POOL',
								files: [
									'fixtures/reply.txt',
									'fixtures/other.txt',
								],
								stopReason: 'max_tokens',
							},
						],
					},
				},
				server: { port: 8001, host: '0.0.0.0' },
			}),
		);

		loadConfig(configPath);
		Object.assign(process.env, {
			LLM_MODEL_NAME: 'rules',
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

	const post = async (format: string, marker: string, stream: boolean) => {
		process.env.LLM_NAME = format;
		// The claude format streams when the request asks; the others
		// follow the preset's `stream` setting
		process.env.STREAM = String(stream);

		return app.inject({
			method: 'POST',
			url: '/chat',
			payload: {
				model: 'test-model',
				max_tokens: 16,
				stream,
				messages: [{ role: 'user', content: marker }],
			},
		});
	};

	// The JSON of every `data:` line of an SSE body, [DONE] left out
	const streamData = (payload: string): any[] =>
		payload
			.split('\n')
			.filter((line) => line.startsWith('data: {'))
			.map((line) => JSON.parse(line.slice('data: '.length)));

	const cases: Array<[string, StopReason | undefined]> = [
		['WANT_NONE', undefined],
		['WANT_END', 'end'],
		['WANT_MAX_TOKENS', 'max_tokens'],
		['WANT_REFUSAL', 'refusal'],
	];

	test('reaches the reply only when it is not a normal end', async () => {
		expect(await generateResponseContent({ text: 'WANT_NONE' })).toEqual({
			text: fixture,
		});
		expect(
			await generateResponseContent({ text: 'WANT_MAX_TOKENS' }),
		).toEqual({ text: fixture, stopReason: 'max_tokens' });
		expect(
			await generateResponseContent({ text: 'no marker' }),
		).not.toHaveProperty('stopReason');
	});

	describe.each(cases)('%s', (marker, stopReason) => {
		const reason = stopReason ?? 'end';
		const refusal = {
			type: 'refusal',
			category: null,
			explanation: null,
		};

		test('claude, not streamed', async () => {
			const body = (await post('claude', marker, false)).json();

			expect(body.stop_reason).toBe(toWireStopReason('claude', reason));
			expect(body.content).toEqual([{ type: 'text', text: fixture }]);
			// stop_details is the refused reply's own field
			if (reason === 'refusal') {
				expect(body.stop_details).toEqual(refusal);
			} else {
				expect(body).not.toHaveProperty('stop_details');
			}
		});

		test('claude, streamed', async () => {
			const response = await post('claude', marker, true);
			const events = streamData(response.payload);
			const delta = events.find((e) => e.type === 'message_delta');

			expect(response.headers['content-type']).toBe('text/event-stream');
			expect(delta.delta).toEqual({
				stop_reason: toWireStopReason('claude', reason),
				stop_sequence: null,
				...(reason === 'refusal' && { stop_details: refusal }),
			});
			expect(
				events
					.filter((e) => e.type === 'content_block_delta')
					.map((e) => e.delta.text)
					.join(''),
			).toBe(fixture);
			expect(events.at(-1).type).toBe('message_stop');
		});

		test('openai, not streamed', async () => {
			const body = (await post('openai', marker, false)).json();

			expect(body.choices).toHaveLength(1);
			expect(body.choices[0].finish_reason).toBe(
				toWireStopReason('openai', reason),
			);
			expect(body.choices[0].message.content).toBe(fixture);
		});

		test('gemini, not streamed', async () => {
			const body = (await post('gemini', marker, false)).json();

			expect(body.candidates).toHaveLength(1);
			expect(body.candidates[0].finishReason).toBe(
				toWireStopReason('gemini', reason),
			);
			expect(body.candidates[0].content.parts[0].text).toBe(fixture);
		});

		// gemini streams in the OpenAI shape, so it gets the OpenAI value
		test.each(['openai', 'gemini'])('%s, streamed', async (format) => {
			const response = await post(format, marker, true);
			const chunks = streamData(response.payload);
			const finishReasons = chunks.map(
				(chunk) => chunk.choices[0].finish_reason,
			);

			expect(finishReasons.at(-1)).toBe(
				toWireStopReason('openai', reason),
			);
			expect(finishReasons.slice(0, -1).every((r) => r === null)).toBe(
				true,
			);
			expect(
				chunks.map((c) => c.choices[0].delta.content ?? '').join(''),
			).toBe(fixture);
			expect(response.payload.trimEnd().endsWith('data: [DONE]')).toBe(
				true,
			);
		});
	});

	test('a rule with several files carries its stop reason too', async () => {
		const body = (await post('claude', 'WANT_POOL', false)).json();
		expect(body.stop_reason).toBe('max_tokens');

		const streamed = streamData(
			(await post('openai', 'WANT_POOL', true)).payload,
		);
		expect(streamed.at(-1).choices[0].finish_reason).toBe('length');
	});
});
