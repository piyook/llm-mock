/* eslint-disable  @typescript-eslint/naming-convention */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import fastify, { type FastifyInstance } from 'fastify';
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import {
	getChaosStats,
	getStalledCount,
	releaseStalledOnClose,
	resetChaos,
} from '../../utilities/chaos.js';

// Chaos kinds that fail a stream part-way through, over a real socket: a
// dropped or stalled connection can't be seen through app.inject.

// Ten words, which both stream shapes send as five content deltas
const fixture = 'one two three four five six seven eight nine ten';
const deltaCount = 5;

type Outcome = {
	status?: number;
	headers: http.IncomingHttpHeaders;
	text: string;
	// end: the response finished. dropped: the connection was cut.
	// open: still open with nothing more arriving when the wait ran out.
	ended: 'end' | 'dropped' | 'open';
	// Closes the client's side of a connection left open
	disconnect: () => void;
};

let dir: string;
let app: FastifyInstance;
let port: number;
const previousEnv = { ...process.env };

const startApp = async () => {
	const { default: chat } = await import('../../api/completions/api.js');
	const { default: embeddings } = await import('../../api/embeddings/api.js');
	const server = fastify({ logger: false });
	releaseStalledOnClose(server);
	chat(server, 'chat');
	embeddings(server, 'embeddings');
	await server.listen({ port: 0, host: '127.0.0.1' });

	return server;
};

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), 'llmock-chaos-stream-'));
	mkdirSync(join(dir, 'fixtures'));
	writeFileSync(join(dir, 'fixtures', 'reply.txt'), fixture);

	const configPath = join(dir, '.llmockrc.json');
	writeFileSync(
		configPath,
		JSON.stringify({
			defaultModel: 'chaos',
			models: {
				chaos: {
					name: 'claude',
					endpoint: 'chat',
					responseRules: [
						{ match: 'FAIL_HTTP', fail: { status: 429 } },
						{ match: 'FAIL_DEFAULT', fail: {} },
						{
							match: 'FAIL_ERROR',
							file: 'fixtures/reply.txt',
							fail: {
								kind: 'stream-error',
								status: 429,
								afterChunks: 1,
							},
						},
						// No fixture: the stream sends generated text
						{ match: 'FAIL_DROP', fail: { kind: 'stream-drop' } },
						{
							match: 'FAIL_STALL',
							file: 'fixtures/reply.txt',
							fail: { kind: 'stream-stall', afterChunks: 0 },
						},
						{ match: 'WANT_TEXT', file: 'fixtures/reply.txt' },
					],
				},
			},
			server: { port: 8001, host: '0.0.0.0' },
		}),
	);

	loadConfig(configPath);
	Object.assign(process.env, {
		LLM_MODEL_NAME: 'chaos',
		LLM_URL_ENDPOINT: 'chat',
		MOCK_LLM_RESPONSE_TYPE: 'lorem',
		VALIDATE_REQUESTS: 'OFF',
		LOG_REQUESTS: 'OFF',
		RESPONSE_DELAY_MIN: '0',
		RESPONSE_DELAY_MAX: '0',
		ENABLE_EMBEDDINGS_MOCK: 'true',
	});

	app = await startApp();
	port = (app.server.address() as AddressInfo).port;
});

afterAll(async () => {
	await app.close();
	rmSync(dir, { recursive: true, force: true });
	process.env = previousEnv;
});

beforeEach(() => {
	Object.assign(process.env, {
		CHAOS_ENABLED: 'true',
		CHAOS_FREQUENCY: '1',
		CHAOS_MODE: 'every',
		CHAOS_STATUS: '529',
		CHAOS_KIND: 'http',
		CHAOS_AFTER_CHUNKS: '2',
	});
	resetChaos();
});

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * Sends a chat request and reports what came back and how the response
 * ended. A connection that goes quiet for `quietMs` is reported as `open`.
 */
const post = (
	format: 'claude' | 'openai' | 'gemini',
	stream: boolean,
	{
		path = '/chat',
		quietMs = 400,
		targetPort = port,
		content = 'WANT_TEXT',
	} = {},
): Promise<Outcome> => {
	process.env.LLM_NAME = format;
	// The claude format streams when the request asks; the others follow
	// the preset's `stream` setting
	process.env.STREAM = String(stream);

	const payload = JSON.stringify({
		model: 'test-model',
		max_tokens: 16,
		stream,
		input: content,
		messages: [{ role: 'user', content }],
	});

	return new Promise((resolve) => {
		const outcome: Outcome = {
			headers: {},
			text: '',
			ended: 'open',
			disconnect: () => request.destroy(),
		};
		let quiet: NodeJS.Timeout;
		let settled = false;

		const settle = (ended: Outcome['ended']) => {
			if (settled) return;
			settled = true;
			clearTimeout(quiet);
			resolve({ ...outcome, ended });
		};

		const waitForQuiet = () => {
			clearTimeout(quiet);
			quiet = setTimeout(() => settle('open'), quietMs);
		};

		const request = http.request(
			{
				host: '127.0.0.1',
				port: targetPort,
				path,
				method: 'POST',
				agent: false,
				headers: {
					'content-type': 'application/json',
					'content-length': Buffer.byteLength(payload),
				},
			},
			(response) => {
				outcome.status = response.statusCode;
				outcome.headers = response.headers;
				response.setEncoding('utf8');
				response.on('data', (chunk: string) => {
					outcome.text += chunk;
					waitForQuiet();
				});
				response.on('end', () => settle('end'));
				response.on('aborted', () => settle('dropped'));
				response.on('error', () => settle('dropped'));
			},
		);

		request.on('error', () => settle('dropped'));
		request.end(payload);
		waitForQuiet();
	});
};

// An SSE body as its events, each `{ event?, data }` with `data` parsed
// where it is JSON
const sseEvents = (text: string) =>
	text
		.split('\n\n')
		.filter((block) => block.trim() !== '')
		.map((block) => {
			const lines = block.split('\n');
			const data =
				lines
					.find((line) => line.startsWith('data: '))
					?.slice('data: '.length) ?? '';
			return {
				event: lines
					.find((line) => line.startsWith('event: '))
					?.slice('event: '.length),
				data: data.startsWith('{') ? JSON.parse(data) : data,
			};
		});

const claudeText = (events: ReturnType<typeof sseEvents>) =>
	events
		.filter((e) => e.event === 'content_block_delta')
		.map((e) => e.data.delta.text);

const openaiText = (events: ReturnType<typeof sseEvents>) =>
	events
		.filter((e) => typeof e.data?.choices?.[0]?.delta?.content === 'string')
		.map((e) => e.data.choices[0].delta.content);

const claudeClosing = ['content_block_stop', 'message_delta', 'message_stop'];

// Waits for the server to notice a client has gone
const waitForStalled = async (count: number) => {
	await vi.waitFor(() => expect(getStalledCount()).toBe(count), {
		timeout: 2000,
		interval: 10,
	});
};

const claudeError = {
	type: 'error',
	error: {
		type: 'overloaded_error',
		message: 'llmock chaos: simulated 529 error',
	},
};

const openaiError = {
	error: {
		message: 'llmock chaos: simulated 529 error',
		type: 'server_error',
		param: null,
		code: null,
	},
};

describe('a streamed call in the claude format', () => {
	// What every kind sends before it fails: the two opening events and
	// `sent` deltas, with none of the closing events
	const expectCut = (
		events: ReturnType<typeof sseEvents>,
		sent: number,
		rest: string[] = [],
	) => {
		expect(events.map((e) => e.event)).toEqual([
			'message_start',
			'content_block_start',
			...Array.from({ length: sent }, () => 'content_block_delta'),
			...rest,
		]);
		expect(claudeText(events).join('')).toBe(
			fixture
				.split(' ')
				.slice(0, sent * 2)
				.join(' ') + (sent > 0 && sent < deltaCount ? ' ' : ''),
		);
		for (const closing of claudeClosing) {
			expect(events.map((e) => e.event)).not.toContain(closing);
		}
	};

	test('stream-error sends the deltas, then the error event, then ends', async () => {
		process.env.CHAOS_KIND = 'stream-error';

		const outcome = await post('claude', true);
		const events = sseEvents(outcome.text);

		expect(outcome.status).toBe(200);
		expect(outcome.headers['content-type']).toBe('text/event-stream');
		expect(outcome.headers['x-llmock-chaos']).toBe('true');
		expect(outcome.ended).toBe('end');
		expectCut(events, 2, ['error']);
		expect(events.at(-1)?.data).toEqual(claudeError);
		expect(getChaosStats()).toEqual({ calls: 1, injected: 1 });
	});

	test.each([
		[429, 'rate_limit_error'],
		[529, 'overloaded_error'],
		[500, 'api_error'],
	])('stream-error with a status of %i is a %s', async (status, type) => {
		process.env.CHAOS_KIND = 'stream-error';
		process.env.CHAOS_STATUS = String(status);

		const outcome = await post('claude', true);

		// The headers have gone by the time it fails
		expect(outcome.status).toBe(200);
		expect(outcome.headers).not.toHaveProperty('retry-after');
		expect(sseEvents(outcome.text).at(-1)).toEqual({
			event: 'error',
			data: {
				type: 'error',
				error: {
					type,
					message: `llmock chaos: simulated ${status} error`,
				},
			},
		});
	});

	test('stream-drop sends the deltas, then cuts the connection', async () => {
		process.env.CHAOS_KIND = 'stream-drop';

		const outcome = await post('claude', true);

		expect(outcome.status).toBe(200);
		expect(outcome.headers['x-llmock-chaos']).toBe('true');
		expect(outcome.ended).toBe('dropped');
		expectCut(sseEvents(outcome.text), 2);
		expect(getChaosStats().injected).toBe(1);
	});

	test('stream-stall sends the deltas, then nothing, and stays open', async () => {
		process.env.CHAOS_KIND = 'stream-stall';

		const outcome = await post('claude', true);

		expect(outcome.status).toBe(200);
		expect(outcome.headers['x-llmock-chaos']).toBe('true');
		expect(outcome.ended).toBe('open');
		expectCut(sseEvents(outcome.text), 2);
		expect(getChaosStats().injected).toBe(1);
		expect(getStalledCount()).toBe(1);

		outcome.disconnect();
		await waitForStalled(0);
	});

	test.each(['stream-error', 'stream-drop', 'stream-stall'])(
		'%s with afterChunks 0 fails straight after the opening events',
		async (kind) => {
			process.env.CHAOS_KIND = kind;
			process.env.CHAOS_AFTER_CHUNKS = '0';

			const outcome = await post('claude', true);

			expectCut(
				sseEvents(outcome.text),
				0,
				kind === 'stream-error' ? ['error'] : [],
			);
			outcome.disconnect();
		},
	);

	test.each(['stream-error', 'stream-drop', 'stream-stall'])(
		'%s with afterChunks above the delta count fails after the last delta',
		async (kind) => {
			process.env.CHAOS_KIND = kind;
			process.env.CHAOS_AFTER_CHUNKS = '99';

			const outcome = await post('claude', true);
			const events = sseEvents(outcome.text);

			expectCut(
				events,
				deltaCount,
				kind === 'stream-error' ? ['error'] : [],
			);
			expect(claudeText(events).join('')).toBe(fixture);
			outcome.disconnect();
		},
	);
});

describe.each(['openai', 'gemini'] as const)(
	'a streamed call in the OpenAI-style stream (%s)',
	(format) => {
		// The role chunk and `sent` content chunks, with no finish_reason
		// chunk and no [DONE]
		const expectCut = (
			events: ReturnType<typeof sseEvents>,
			sent: number,
		) => {
			const chunks = events.filter((e) => e.data?.choices);

			expect(chunks).toHaveLength(1 + sent);
			expect(chunks[0].data.choices[0].delta).toEqual({
				role: 'assistant',
			});
			expect(openaiText(events).join('')).toBe(
				fixture
					.split(' ')
					.slice(0, sent * 2)
					.join(' '),
			);
			expect(
				chunks.every((c) => c.data.choices[0].finish_reason === null),
			).toBe(true);
			expect(events.map((e) => e.data)).not.toContain('[DONE]');
		};

		test('stream-error sends the deltas, then the error, with no [DONE]', async () => {
			process.env.CHAOS_KIND = 'stream-error';

			const outcome = await post(format, true);
			const events = sseEvents(outcome.text);

			expect(outcome.status).toBe(200);
			expect(outcome.headers['x-llmock-chaos']).toBe('true');
			expect(outcome.ended).toBe('end');
			expectCut(events, 2);
			// The OpenAI error body, whichever preset is streaming
			expect(events.at(-1)).toEqual({
				event: undefined,
				data: openaiError,
			});
			expect(events).toHaveLength(4);
			expect(getChaosStats()).toEqual({ calls: 1, injected: 1 });
		});

		test('stream-drop sends the deltas, then cuts the connection', async () => {
			process.env.CHAOS_KIND = 'stream-drop';

			const outcome = await post(format, true);
			const events = sseEvents(outcome.text);

			expect(outcome.status).toBe(200);
			expect(outcome.headers['x-llmock-chaos']).toBe('true');
			expect(outcome.ended).toBe('dropped');
			expectCut(events, 2);
			expect(events).toHaveLength(3);
		});

		test('stream-stall sends the deltas, then nothing, and stays open', async () => {
			process.env.CHAOS_KIND = 'stream-stall';

			const outcome = await post(format, true);
			const events = sseEvents(outcome.text);

			expect(outcome.status).toBe(200);
			expect(outcome.headers['x-llmock-chaos']).toBe('true');
			expect(outcome.ended).toBe('open');
			expectCut(events, 2);
			expect(events).toHaveLength(3);
			expect(getStalledCount()).toBe(1);

			outcome.disconnect();
			await waitForStalled(0);
		});

		test.each(['stream-error', 'stream-drop', 'stream-stall'])(
			'%s with afterChunks 0 fails straight after the role chunk',
			async (kind) => {
				process.env.CHAOS_KIND = kind;
				process.env.CHAOS_AFTER_CHUNKS = '0';

				const outcome = await post(format, true);

				expectCut(sseEvents(outcome.text), 0);
				outcome.disconnect();
			},
		);

		test.each(['stream-error', 'stream-drop', 'stream-stall'])(
			'%s with afterChunks above the delta count fails after the last delta',
			async (kind) => {
				process.env.CHAOS_KIND = kind;
				process.env.CHAOS_AFTER_CHUNKS = '99';

				const outcome = await post(format, true);
				const events = sseEvents(outcome.text);

				expectCut(events, deltaCount);
				expect(openaiText(events).join('')).toBe(fixture);
				outcome.disconnect();
			},
		);
	},
);

describe('a call that did not ask for a stream', () => {
	test.each([
		['claude', claudeError],
		['openai', openaiError],
	] as const)(
		'stream-error falls back to the HTTP error (%s)',
		async (format, error) => {
			process.env.CHAOS_KIND = 'stream-error';

			const outcome = await post(format, false);

			expect(outcome.status).toBe(529);
			expect(outcome.ended).toBe('end');
			expect(outcome.headers['content-type']).toContain(
				'application/json',
			);
			expect(outcome.headers['x-llmock-chaos']).toBe('true');
			expect(outcome.headers['retry-after']).toBe('1');
			expect(JSON.parse(outcome.text)).toEqual(error);
		},
	);

	test.each(['claude', 'openai'] as const)(
		'stream-drop cuts the connection without answering (%s)',
		async (format) => {
			process.env.CHAOS_KIND = 'stream-drop';

			const outcome = await post(format, false);

			expect(outcome.ended).toBe('dropped');
			expect(outcome.status).toBeUndefined();
			expect(outcome.text).toBe('');
			expect(getChaosStats()).toEqual({ calls: 1, injected: 1 });
		},
	);

	test.each(['claude', 'openai'] as const)(
		'stream-stall holds the connection open without answering (%s)',
		async (format) => {
			process.env.CHAOS_KIND = 'stream-stall';

			const outcome = await post(format, false);

			expect(outcome.ended).toBe('open');
			expect(outcome.status).toBeUndefined();
			expect(outcome.text).toBe('');
			expect(getChaosStats()).toEqual({ calls: 1, injected: 1 });
			expect(getStalledCount()).toBe(1);

			outcome.disconnect();
			await waitForStalled(0);
		},
	);

	test('the embeddings route drops and stalls too', async () => {
		process.env.CHAOS_KIND = 'stream-drop';
		const dropped = await post('openai', false, {
			path: '/v1/embeddings',
		});
		expect(dropped.ended).toBe('dropped');

		process.env.CHAOS_KIND = 'stream-stall';
		const stalled = await post('openai', false, {
			path: '/v1/embeddings',
		});
		expect(stalled.ended).toBe('open');
		expect(stalled.status).toBeUndefined();

		stalled.disconnect();
		await waitForStalled(0);
	});
});

describe('which calls fail', () => {
	test('frequency and mode decide, with the one shared counter', async () => {
		process.env.CHAOS_KIND = 'stream-error';
		process.env.CHAOS_FREQUENCY = '2';

		const first = await post('claude', true);
		const second = await post('claude', true);
		const third = await post('claude', false);
		const fourth = await post('claude', false);

		// A call that is not failed is a complete, unmarked stream
		expect(sseEvents(first.text).at(-1)?.event).toBe('message_stop');
		expect(first.headers).not.toHaveProperty('x-llmock-chaos');
		expect(sseEvents(second.text).at(-1)?.event).toBe('error');
		expect(third.status).toBe(200);
		expect(fourth.status).toBe(529);
		expect(getChaosStats()).toEqual({ calls: 4, injected: 2 });
	});

	test('the http kind still answers a streamed call with the JSON error', async () => {
		const outcome = await post('claude', true);

		expect(outcome.status).toBe(529);
		expect(JSON.parse(outcome.text)).toEqual(claudeError);
	});

	test('the response delay runs before a stream failure', async () => {
		process.env.CHAOS_KIND = 'stream-drop';
		process.env.RESPONSE_DELAY_MIN = '300';
		process.env.RESPONSE_DELAY_MAX = '300';
		try {
			const started = Date.now();
			const outcome = await post('claude', false, { quietMs: 2000 });

			expect(outcome.ended).toBe('dropped');
			expect(Date.now() - started).toBeGreaterThanOrEqual(290);
		} finally {
			process.env.RESPONSE_DELAY_MIN = '0';
			process.env.RESPONSE_DELAY_MAX = '0';
		}
	});
});

describe('a response rule with fail', () => {
	const rateLimited = {
		type: 'error',
		error: {
			type: 'rate_limit_error',
			message: 'llmock chaos: simulated 429 error',
		},
	};

	beforeEach(() => {
		process.env.CHAOS_ENABLED = 'false';
	});

	test('fails the call that matches it with chaos off, and no other', async () => {
		const failed = await post('claude', false, { content: 'FAIL_HTTP' });
		const other = await post('claude', false);

		expect(failed.status).toBe(429);
		expect(failed.headers['x-llmock-chaos']).toBe('true');
		expect(failed.headers['retry-after']).toBe('1');
		expect(JSON.parse(failed.text)).toEqual(rateLimited);
		expect(other.status).toBe(200);
		expect(other.headers).not.toHaveProperty('x-llmock-chaos');
		expect(JSON.parse(other.text).content[0].text).toBe(fixture);
		// Counted as a failure, but not as a call chaos could have failed
		expect(getChaosStats()).toEqual({ calls: 0, injected: 1 });
	});

	test('fails every time it matches', async () => {
		for (let i = 0; i < 3; i++) {
			const outcome = await post('claude', true, {
				content: 'FAIL_HTTP',
			});
			expect(outcome.status).toBe(429);
		}
	});

	test('an empty fail is an HTTP 500', async () => {
		const outcome = await post('claude', true, { content: 'FAIL_DEFAULT' });

		expect(outcome.status).toBe(500);
		expect(JSON.parse(outcome.text).error.type).toBe('api_error');
	});

	test('stream-error cuts a claude stream of its fixture with the error event', async () => {
		const outcome = await post('claude', true, { content: 'FAIL_ERROR' });
		const events = sseEvents(outcome.text);

		expect(outcome.status).toBe(200);
		expect(outcome.headers['x-llmock-chaos']).toBe('true');
		expect(outcome.ended).toBe('end');
		expect(events.map((e) => e.event)).toEqual([
			'message_start',
			'content_block_start',
			'content_block_delta',
			'error',
		]);
		expect(claudeText(events)).toEqual(['one two ']);
		expect(events.at(-1)?.data).toEqual(rateLimited);
	});

	test('stream-error cuts an OpenAI-style stream with the error and no [DONE]', async () => {
		const outcome = await post('openai', true, { content: 'FAIL_ERROR' });
		const events = sseEvents(outcome.text);

		expect(outcome.status).toBe(200);
		expect(outcome.ended).toBe('end');
		expect(openaiText(events)).toEqual(['one two']);
		expect(events.at(-1)?.data).toEqual({
			error: {
				message: 'llmock chaos: simulated 429 error',
				type: 'rate_limit_error',
				param: null,
				code: 'rate_limit_exceeded',
			},
		});
		expect(events.map((e) => e.data)).not.toContain('[DONE]');
	});

	test('stream-error answers a call that did not ask for a stream with the HTTP error', async () => {
		const outcome = await post('claude', false, { content: 'FAIL_ERROR' });

		expect(outcome.status).toBe(429);
		expect(JSON.parse(outcome.text)).toEqual(rateLimited);
	});

	test('stream-drop with no fixture cuts a stream of generated text', async () => {
		const outcome = await post('claude', true, { content: 'FAIL_DROP' });
		const events = sseEvents(outcome.text);

		expect(outcome.status).toBe(200);
		expect(outcome.ended).toBe('dropped');
		expect(events.at(-1)?.event).toBe('content_block_delta');
		expect(claudeText(events).length).toBeGreaterThan(0);
		expect(claudeText(events).length).toBeLessThanOrEqual(2);
		expect(claudeText(events).join('')).not.toContain('one two');
	});

	test('stream-drop cuts a call that did not ask for a stream', async () => {
		const outcome = await post('claude', false, { content: 'FAIL_DROP' });

		expect(outcome.status).toBeUndefined();
		expect(outcome.ended).toBe('dropped');
	});

	test('stream-stall holds the stream open until the client goes', async () => {
		const outcome = await post('claude', true, { content: 'FAIL_STALL' });
		const events = sseEvents(outcome.text);

		expect(outcome.ended).toBe('open');
		expect(events.map((e) => e.event)).toEqual([
			'message_start',
			'content_block_start',
		]);
		expect(getStalledCount()).toBe(1);

		outcome.disconnect();
		await waitForStalled(0);
	});

	test('does not move which of the other calls chaos fails', async () => {
		process.env.CHAOS_ENABLED = 'true';
		process.env.CHAOS_FREQUENCY = '2';

		const first = await post('claude', false);
		const byRule = await post('claude', false, { content: 'FAIL_HTTP' });
		const second = await post('claude', false);

		expect(first.status).toBe(200);
		// The rule's own status, not the chaos one
		expect(byRule.status).toBe(429);
		expect(second.status).toBe(529);
		expect(getChaosStats()).toEqual({ calls: 2, injected: 2 });
	});

	test('does not apply to the embeddings route', async () => {
		const outcome = await post('claude', false, {
			path: '/v1/embeddings',
			content: 'FAIL_HTTP',
		});

		expect(outcome.status).toBe(200);
	});
});

describe('a stalled connection', () => {
	test('is let go of when its client disconnects, one at a time', async () => {
		process.env.CHAOS_KIND = 'stream-stall';

		const streamed = await post('claude', true);
		const unanswered = await post('openai', false);
		expect(getStalledCount()).toBe(2);

		streamed.disconnect();
		await waitForStalled(1);

		unanswered.disconnect();
		await waitForStalled(0);

		// The server carries on answering
		process.env.CHAOS_ENABLED = 'false';
		expect((await post('claude', false)).status).toBe(200);
	});

	test('does not stop the server from closing', async () => {
		process.env.CHAOS_KIND = 'stream-stall';
		const second = await startApp();
		const secondPort = (second.server.address() as AddressInfo).port;

		const streamed = await post('claude', true, {
			targetPort: secondPort,
		});
		const unanswered = await post('claude', false, {
			targetPort: secondPort,
		});
		expect(streamed.ended).toBe('open');
		expect(unanswered.ended).toBe('open');
		expect(getStalledCount()).toBe(2);

		// Fails on the test timeout if the stalled connections hold it up
		await second.close();

		expect(getStalledCount()).toBe(0);
		expect(second.server.listening).toBe(false);
	}, 5000);
});
