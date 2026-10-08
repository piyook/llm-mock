/* eslint-disable  @typescript-eslint/naming-convention */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import adminApi, { adminApiEnabled } from '../../utilities/admin-api.js';
import { getChaosStats, shouldInjectError } from '../../utilities/chaos.js';
import {
	generateResponseContent,
	getRuleFailure,
} from '../../utilities/response-helpers.js';
import { clearRuntimeRules } from '../../utilities/runtime-rules.js';

// The admin routes, and what the rules they add do to the replies
describe('admin API', () => {
	let dir: string;
	let app: FastifyInstance;
	const previous = {
		type: process.env.MOCK_LLM_RESPONSE_TYPE,
		max: process.env.MAX_LOREM_PARAS,
		model: process.env.LLM_MODEL_NAME,
	};

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-admin-api-'));
		mkdirSync(join(dir, 'fixtures'));
		writeFileSync(join(dir, 'fixtures', 'text.txt'), 'from the file');

		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'claude',
				models: {
					claude: {
						name: 'claude',
						model: 'claude-opus-5-5',
						endpoint: 'v1/messages',
						responseType: 'lorem',
						maxLoremParas: 3,
						validateRequests: false,
						logRequests: false,
						debug: false,
						stream: false,
						responseDelay: { min: 0, max: 0 },
						embeddings: { enabled: false, dimensions: 128 },
						responseRules: [
							{ match: 'WANT_FILE', file: 'fixtures/text.txt' },
							{ match: 'WANT_INLINE', text: 'from the config' },
						],
					},
				},
				server: { port: 8001, host: '0.0.0.0' },
			}),
		);

		loadConfig(configPath);
		process.env.LLM_MODEL_NAME = 'claude';
		process.env.MOCK_LLM_RESPONSE_TYPE = 'lorem';
		process.env.MAX_LOREM_PARAS = '3';

		app = fastify({ logger: false });
		adminApi(app);
	});

	afterEach(() => clearRuntimeRules());

	afterAll(async () => {
		await app.close();
		rmSync(dir, { recursive: true, force: true });
		for (const [key, value] of [
			['MOCK_LLM_RESPONSE_TYPE', previous.type],
			['MAX_LOREM_PARAS', previous.max],
			['LLM_MODEL_NAME', previous.model],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	const send = async (method: 'GET' | 'POST' | 'DELETE', url: string) => {
		const response = await app.inject({ method, url });
		return { status: response.statusCode, body: response.json() };
	};

	const addRule = async (payload: unknown) => {
		const response = await app.inject({
			method: 'POST',
			url: '/admin/rules',
			payload: payload as object,
		});
		return { status: response.statusCode, body: response.json() };
	};

	const request = (text: string) => ({
		messages: [{ role: 'user', content: text }],
	});

	const replyTo = async (text: string) =>
		(await generateResponseContent(request(text))).text;

	const configRules = [
		{
			id: null,
			source: 'config',
			match: 'WANT_FILE',
			text: null,
			files: ['fixtures/text.txt'],
			stopReason: 'end',
			fail: null,
		},
		{
			id: null,
			source: 'config',
			match: 'WANT_INLINE',
			text: 'from the config',
			files: [],
			stopReason: 'end',
			fail: null,
		},
	];

	test('GET admin/rules lists the config file rules', async () => {
		const { status, body } = await send('GET', '/admin/rules');

		expect(status).toBe(200);
		expect(body).toEqual({ rules: configRules });
	});

	test('a config file rule can hold its reply as text', async () => {
		expect(await replyTo('WANT_INLINE')).toBe('from the config');
	});

	test('POST admin/rules adds a rule that replies with its text', async () => {
		const { status, body } = await addRule({
			match: 'WANT_RUNTIME',
			text: '{"priority":"high"}',
		});

		expect(status).toBe(201);
		expect(body.rule).toEqual({
			id: expect.stringMatching(/^r\d+$/),
			source: 'runtime',
			match: 'WANT_RUNTIME',
			text: '{"priority":"high"}',
			files: [],
			stopReason: 'end',
			fail: null,
		});
		expect(await replyTo('please WANT_RUNTIME')).toBe(
			'{"priority":"high"}',
		);
	});

	test('runtime rules are listed and matched before the config file rules', async () => {
		const first = await addRule({ match: 'WANT_FILE', text: 'overridden' });
		const second = await addRule({ match: 'WANT_FILE', text: 'too late' });

		const { body } = await send('GET', '/admin/rules');

		expect(body.rules).toEqual([
			first.body.rule,
			second.body.rule,
			...configRules,
		]);
		expect(await replyTo('WANT_FILE')).toBe('overridden');
	});

	test('a runtime rule can set how the reply ends', async () => {
		const { body } = await addRule({
			match: 'WANT_CUT',
			text: 'cut off mid',
			stopReason: 'max_tokens',
		});

		expect(body.rule.stopReason).toBe('max_tokens');
		expect(await generateResponseContent(request('WANT_CUT'))).toEqual({
			text: 'cut off mid',
			stopReason: 'max_tokens',
		});
	});

	test('a runtime rule can fail the calls that match it', async () => {
		const { status, body } = await addRule({
			match: 'WANT_FAIL',
			fail: { status: 429 },
		});

		expect(status).toBe(201);
		expect(body.rule.fail).toEqual({
			kind: 'http',
			status: 429,
			afterChunks: 2,
		});
		expect(getRuleFailure(request('WANT_FAIL'))).toEqual({
			kind: 'http',
			status: 429,
			afterChunks: 2,
		});
		expect(getRuleFailure(request('something else'))).toBeUndefined();
	});

	test.each([
		['an array', [{ match: 'A', text: 'b' }], /must be a JSON object/],
		['no match', { text: 'b' }, /rule\.match must be a non-empty string/],
		['an empty match', { match: '', text: 'b' }, /rule\.match/],
		['neither text nor fail', { match: 'A' }, /must have text or fail/],
		['a text that is not a string', { match: 'A', text: 5 }, /rule\.text/],
		[
			'a file',
			{ match: 'A', file: '../../secret.txt' },
			/can not use file or files/,
		],
		[
			'files',
			{ match: 'A', files: ['a.txt'] },
			/can not use file or files/,
		],
		[
			'an unknown setting',
			{ match: 'A', text: 'b', times: 2 },
			/unknown settings: times/,
		],
		[
			'an unknown stop reason',
			{ match: 'A', text: 'b', stopReason: 'tool_use' },
			/rule\.stopReason must be one of/,
		],
		[
			'a fail that is not valid',
			{ match: 'A', fail: { status: 200 } },
			/rule\.fail\.status/,
		],
	])('POST admin/rules answers 400 for %s', async (_name, payload, error) => {
		const { status, body } = await addRule(payload);

		expect(status).toBe(400);
		expect(body.error).toMatch(error);
		expect((await send('GET', '/admin/rules')).body.rules).toEqual(
			configRules,
		);
	});

	test('DELETE admin/rules/:id removes that rule only', async () => {
		const first = await addRule({ match: 'ONE', text: 'one' });
		const second = await addRule({ match: 'TWO', text: 'two' });

		const { status, body } = await send(
			'DELETE',
			`/admin/rules/${first.body.rule.id}`,
		);

		expect(status).toBe(200);
		expect(body.rules).toEqual([second.body.rule, ...configRules]);
		expect(await replyTo('ONE')).not.toBe('one');
		expect(await replyTo('TWO')).toBe('two');
	});

	test('DELETE admin/rules/:id answers 404 for an id that is not there', async () => {
		const { status, body } = await send('DELETE', '/admin/rules/r999');

		expect(status).toBe(404);
		expect(body.error).toMatch(/No runtime rule with id "r999"/);
	});

	test('DELETE admin/rules removes the runtime rules and keeps the config file rules', async () => {
		await addRule({ match: 'ONE', text: 'one' });
		await addRule({ match: 'TWO', text: 'two' });

		const { status, body } = await send('DELETE', '/admin/rules');

		expect(status).toBe(200);
		expect(body.rules).toEqual(configRules);
		expect(await replyTo('WANT_FILE')).toBe('from the file');
	});

	test('POST admin/reset removes the runtime rules and zeroes the chaos count', async () => {
		const settings = { CHAOS_ENABLED: 'true', CHAOS_FREQUENCY: '2' };
		Object.assign(process.env, settings);
		try {
			await addRule({ match: 'ONE', text: 'one' });
			shouldInjectError();
			shouldInjectError();
			expect(getChaosStats()).toEqual({ calls: 2, injected: 1 });

			const { status, body } = await send('POST', '/admin/reset');

			expect(status).toBe(200);
			expect(body.rules).toEqual(configRules);
			expect(getChaosStats()).toEqual({ calls: 0, injected: 0 });
			// The count starts again, so the 2nd call is the one that fails
			expect(shouldInjectError()).toBe(false);
			expect(shouldInjectError()).toBe(true);
		} finally {
			await send('POST', '/admin/reset');
			for (const key of Object.keys(settings)) delete process.env[key];
		}
	});

	test('an id is not given out again after a reset', async () => {
		const before = await addRule({ match: 'ONE', text: 'one' });
		await send('POST', '/admin/reset');
		const after = await addRule({ match: 'ONE', text: 'one' });

		expect(after.body.rule.id).not.toBe(before.body.rule.id);
	});

	test('the admin API is on unless ADMIN_API is false', () => {
		const before = process.env.ADMIN_API;
		try {
			delete process.env.ADMIN_API;
			expect(adminApiEnabled()).toBe(true);
			process.env.ADMIN_API = 'true';
			expect(adminApiEnabled()).toBe(true);
			process.env.ADMIN_API = 'false';
			expect(adminApiEnabled()).toBe(false);
		} finally {
			if (before === undefined) delete process.env.ADMIN_API;
			else process.env.ADMIN_API = before;
		}
	});
});
