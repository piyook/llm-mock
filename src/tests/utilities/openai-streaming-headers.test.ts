/* eslint-disable  @typescript-eslint/naming-convention */
import fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { applyChaos, resetChaos } from '../../utilities/chaos.js';
import { handleStreamingResponse } from '../../utilities/response-helpers.js';

// An OpenAI-format stream sent through a real Fastify reply, as the
// completions route sends it, so the headers that reach the client are checked
// (not only which calls were made on the reply).
const originalEnv = process.env;

describe('OpenAI-format stream headers', () => {
	let app: FastifyInstance;

	beforeEach(() => {
		process.env = {
			...originalEnv,
			LLM_NAME: 'openai',
			RESPONSE_DELAY_MIN: '0',
			RESPONSE_DELAY_MAX: '0',
		};
		delete process.env.CHAOS_ENABLED;
		delete process.env.CHAOS_FREQUENCY;
		delete process.env.CHAOS_STATUS;
		delete process.env.CHAOS_KIND;
		delete process.env.CHAOS_AFTER_CHUNKS;
		resetChaos();

		app = fastify({ logger: false });
		app.post('/chat', async (_request, reply) => {
			const chaos = applyChaos(reply, 'openai', true);
			if (chaos === true) return reply;
			return handleStreamingResponse(
				{ text: 'Hello from the mock' },
				reply,
				chaos || undefined,
			);
		});
	});

	afterEach(async () => {
		await app.close();
		process.env = originalEnv;
	});

	const call = () => app.inject({ method: 'POST', url: '/chat', body: {} });

	test('sends content-type text/event-stream with the stream', async () => {
		const response = await call();

		expect(response.statusCode).toBe(200);
		expect(response.headers['content-type']).toBe('text/event-stream');
		expect(response.headers['cache-control']).toBe('no-cache');
		expect(response.headers['access-control-allow-origin']).toBe('*');
		expect(response.body.trim().endsWith('data: [DONE]')).toBe(true);
	});

	test('a chaos stream-error stream keeps the SSE and chaos headers', async () => {
		process.env.CHAOS_ENABLED = 'true';
		process.env.CHAOS_KIND = 'stream-error';
		process.env.CHAOS_AFTER_CHUNKS = '1';

		const response = await call();

		expect(response.statusCode).toBe(200);
		expect(response.headers['content-type']).toBe('text/event-stream');
		expect(response.headers['x-llmock-chaos']).toBe('true');
		expect(response.body).not.toContain('[DONE]');
		expect(response.body).toContain('"error"');
	});
});
