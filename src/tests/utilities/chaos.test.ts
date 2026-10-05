/* eslint-disable  @typescript-eslint/naming-convention */
import fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	applyChaos,
	buildChaosError,
	getChaosConfig,
	getChaosStats,
	resetChaos,
	shouldInjectError,
} from '../../utilities/chaos.js';

const originalEnv = process.env;

beforeEach(() => {
	process.env = { ...originalEnv };
	delete process.env.CHAOS_ENABLED;
	delete process.env.CHAOS_FREQUENCY;
	delete process.env.CHAOS_MODE;
	delete process.env.CHAOS_STATUS;
	resetChaos();
});

afterEach(() => {
	process.env = originalEnv;
	vi.restoreAllMocks();
});

// Outcome of the next `count` calls: true where the call fails
const outcomes = (count: number) =>
	Array.from({ length: count }, () => shouldInjectError());

describe('getChaosConfig', () => {
	test('is off with the defaults when nothing is set', () => {
		expect(getChaosConfig()).toEqual({
			enabled: false,
			frequency: 1,
			mode: 'every',
			status: 500,
		});
	});

	test('reads the settings from the environment', () => {
		process.env.CHAOS_ENABLED = 'true';
		process.env.CHAOS_FREQUENCY = '4';
		process.env.CHAOS_MODE = 'random';
		process.env.CHAOS_STATUS = '429';

		expect(getChaosConfig()).toEqual({
			enabled: true,
			frequency: 4,
			mode: 'random',
			status: 429,
		});
	});

	test.each([
		['0', 1],
		['-3', 1],
		['abc', 1],
		['2.9', 2],
	])('a frequency of "%s" becomes %i', (setting, expected) => {
		process.env.CHAOS_FREQUENCY = setting;

		expect(getChaosConfig().frequency).toBe(expected);
	});

	test.each(['200', '399', '600', 'abc'])(
		'a status of "%s" falls back to 500',
		(setting) => {
			process.env.CHAOS_STATUS = setting;

			expect(getChaosConfig().status).toBe(500);
		},
	);

	test('an unknown mode falls back to every', () => {
		process.env.CHAOS_MODE = 'sometimes';

		expect(getChaosConfig().mode).toBe('every');
	});
});

describe('shouldInjectError', () => {
	test('never fails a call, or counts it, while chaos is off', () => {
		process.env.CHAOS_FREQUENCY = '1';

		expect(outcomes(3)).toEqual([false, false, false]);
		expect(getChaosStats()).toEqual({ calls: 0, injected: 0 });
	});

	test('fails every call at a frequency of 1', () => {
		process.env.CHAOS_ENABLED = 'true';

		expect(outcomes(3)).toEqual([true, true, true]);
		expect(getChaosStats()).toEqual({ calls: 3, injected: 3 });
	});

	test('fails each Xth call in every mode', () => {
		process.env.CHAOS_ENABLED = 'true';
		process.env.CHAOS_FREQUENCY = '3';

		expect(outcomes(7)).toEqual([
			false,
			false,
			true,
			false,
			false,
			true,
			false,
		]);
		expect(getChaosStats()).toEqual({ calls: 7, injected: 2 });
	});

	test('fails with a 1 in X chance in random mode', () => {
		process.env.CHAOS_ENABLED = 'true';
		process.env.CHAOS_FREQUENCY = '4';
		process.env.CHAOS_MODE = 'random';
		const random = vi.spyOn(Math, 'random');

		// 1 in 4: a draw below 0.25 fails
		random.mockReturnValueOnce(0.24).mockReturnValueOnce(0.25);

		expect(outcomes(2)).toEqual([true, false]);
		expect(getChaosStats()).toEqual({ calls: 2, injected: 1 });
	});
});

describe('buildChaosError', () => {
	test.each([
		[500, 'server_error', null],
		[429, 'rate_limit_error', 'rate_limit_exceeded'],
	])('openai shape for a %i', (status, type, code) => {
		expect(buildChaosError('openai', status)).toEqual({
			error: {
				message: `llmock chaos: simulated ${status} error`,
				type,
				param: null,
				code,
			},
		});
	});

	test.each([
		[429, 'rate_limit_error'],
		[529, 'overloaded_error'],
		[500, 'api_error'],
	])('claude shape for a %i', (status, type) => {
		expect(buildChaosError('claude', status)).toEqual({
			type: 'error',
			error: {
				type,
				message: `llmock chaos: simulated ${status} error`,
			},
		});
	});

	test.each([
		[429, 'RESOURCE_EXHAUSTED'],
		[503, 'UNAVAILABLE'],
		[500, 'INTERNAL'],
	])('gemini shape for a %i', (status, state) => {
		expect(buildChaosError('gemini', status)).toEqual({
			error: {
				code: status,
				message: `llmock chaos: simulated ${status} error`,
				status: state,
			},
		});
	});

	test('a custom template name gets the openai shape', () => {
		expect(buildChaosError('my-llm', 500)).toHaveProperty('error.type');
		expect(buildChaosError(undefined, 500)).toHaveProperty('error.type');
	});
});

describe('applyChaos', () => {
	let app: FastifyInstance;

	beforeEach(() => {
		app = fastify({ logger: false });
		app.get('/chat', async (_request, reply) => {
			if (applyChaos(reply)) return reply;
			return reply.send({ ok: true });
		});
	});

	afterEach(async () => {
		await app.close();
	});

	const call = () => app.inject({ method: 'GET', url: '/chat' });

	test('leaves the reply alone while chaos is off', async () => {
		const response = await call();

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ ok: true });
		expect(response.headers['x-llmock-chaos']).toBeUndefined();
	});

	test('sends the error for the active provider on a failing call', async () => {
		process.env.CHAOS_ENABLED = 'true';
		process.env.CHAOS_FREQUENCY = '2';
		process.env.CHAOS_STATUS = '529';
		process.env.LLM_NAME = 'claude';

		const first = await call();
		const second = await call();

		expect(first.statusCode).toBe(200);
		expect(second.statusCode).toBe(529);
		expect(second.json().error.type).toBe('overloaded_error');
		expect(second.headers['x-llmock-chaos']).toBe('true');
		expect(second.headers['retry-after']).toBe('1');
	});

	test.each([
		[429, '1'],
		[503, '1'],
		[529, '1'],
		[500, undefined],
		[400, undefined],
	])('a %i has a retry-after of %s', async (status, retryAfter) => {
		process.env.CHAOS_ENABLED = 'true';
		process.env.CHAOS_STATUS = String(status);

		const response = await call();

		expect(response.statusCode).toBe(status);
		expect(response.headers['retry-after']).toBe(retryAfter);
	});
});
