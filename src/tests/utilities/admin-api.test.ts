/* eslint-disable  @typescript-eslint/naming-convention */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import adminApi, { adminApiEnabled } from '../../utilities/admin-api.js';
import { getChaosStats, shouldInjectError } from '../../utilities/chaos.js';
import { getDelayConfig } from '../../utilities/delay.js';
import {
	generateResponseContent,
	getRuleFailure,
} from '../../utilities/response-helpers.js';
import {
	clearRuntimeRules,
	countRuleUse,
	findRequestRule,
} from '../../utilities/runtime-rules.js';

// The admin routes, and what the rules and settings they change do
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

		// Chaos and delay as this preset has them: both off
		for (const key of Object.keys(process.env)) {
			if (/^(CHAOS_|RESPONSE_DELAY_)/.test(key)) delete process.env[key];
		}

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

	const patch = async (url: string, payload: unknown) => {
		const response = await app.inject({
			method: 'PATCH',
			url,
			payload: payload as object,
		});
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

	// What the server does with a request that chaos leaves alone: finds its
	// rule once, counts it against the rule's `times`, then replies
	const answer = async (text: string) => {
		const body = request(text);
		const matched = findRequestRule(body);
		const failure = getRuleFailure(body, matched);
		countRuleUse(matched?.rule);

		return { failure, reply: await generateResponseContent(body, matched) };
	};

	const replyTo = async (text: string) => (await answer(text)).reply.text;

	const configRules = [
		{
			id: null,
			source: 'config',
			match: 'WANT_FILE',
			text: null,
			files: ['fixtures/text.txt'],
			stopReason: 'end',
			fail: null,
			times: null,
		},
		{
			id: null,
			source: 'config',
			match: 'WANT_INLINE',
			text: 'from the config',
			files: [],
			stopReason: 'end',
			fail: null,
			times: null,
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
			times: null,
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
			{ match: 'A', text: 'b', repeat: 2 },
			/unknown settings: repeat/,
		],
		['a times of 0', { match: 'A', text: 'b', times: 0 }, /rule\.times/],
		[
			'a times that is not whole',
			{ match: 'A', text: 'b', times: 1.5 },
			/rule\.times must be an integer of 1 or more/,
		],
		[
			'a times that is not a number',
			{ match: 'A', text: 'b', times: '2' },
			/rule\.times/,
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

	test('a rule with times answers that many requests, then is removed', async () => {
		const { body } = await addRule({
			match: 'WANT_TWICE',
			text: 'twice only',
			times: 2,
		});
		const timesLeft = async () =>
			(await send('GET', '/admin/rules')).body.rules.find(
				(rule: { id: string }) => rule.id === body.rule.id,
			)?.times;

		expect(body.rule.times).toBe(2);

		// A request that does not match leaves the count alone
		await replyTo('something else');
		expect(await timesLeft()).toBe(2);

		expect(await replyTo('WANT_TWICE')).toBe('twice only');
		expect(await timesLeft()).toBe(1);

		expect(await replyTo('WANT_TWICE')).toBe('twice only');
		expect((await send('GET', '/admin/rules')).body.rules).toEqual(
			configRules,
		);
		expect(await replyTo('WANT_TWICE')).not.toBe('twice only');
	});

	test('a request counts once, however often it is asked about', async () => {
		await addRule({
			match: 'WANT_FAIL_ONCE',
			text: 'the start of it',
			fail: { kind: 'stream-drop' },
			times: 1,
		});

		// The one request both fails as the rule says and starts with its text
		const first = await answer('WANT_FAIL_ONCE');
		expect(first.failure?.kind).toBe('stream-drop');
		expect(first.reply.text).toBe('the start of it');

		const second = await answer('WANT_FAIL_ONCE');
		expect(second.failure).toBeUndefined();
		expect(second.reply.text).not.toBe('the start of it');
	});

	test('a request with a plain text body counts once too', async () => {
		await addRule({ match: 'WANT_PLAIN', text: 'plain', times: 2 });

		const matched = findRequestRule('please WANT_PLAIN');
		expect(getRuleFailure('please WANT_PLAIN', matched)).toBeUndefined();
		countRuleUse(matched?.rule);
		expect(
			(await generateResponseContent('please WANT_PLAIN', matched)).text,
		).toBe('plain');

		expect((await send('GET', '/admin/rules')).body.rules[0].times).toBe(1);
	});

	test('looking a rule up does not count against its times', async () => {
		await addRule({ match: 'WANT_LOOK', text: 'still here', times: 1 });

		// As when chaos fails the call: the rule is found but never counted
		findRequestRule(request('WANT_LOOK'));
		findRequestRule(request('WANT_LOOK'));

		expect((await send('GET', '/admin/rules')).body.rules[0].times).toBe(1);
		expect(await replyTo('WANT_LOOK')).toBe('still here');
	});

	test('rules with times give a different reply to each call in turn', async () => {
		await addRule({ match: 'WANT_FILE', text: 'first', times: 1 });
		await addRule({ match: 'WANT_FILE', text: 'second', times: 1 });

		expect(await replyTo('WANT_FILE')).toBe('first');
		expect(await replyTo('WANT_FILE')).toBe('second');
		expect(await replyTo('WANT_FILE')).toBe('from the file');
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

	const chaosOff = {
		enabled: false,
		frequency: 1,
		mode: 'every',
		status: 500,
		kind: 'http',
		afterChunks: 2,
	};

	test('GET admin/chaos reports the settings and the calls counted', async () => {
		const { status, body } = await send('GET', '/admin/chaos');

		expect(status).toBe(200);
		expect(body).toEqual({
			chaos: chaosOff,
			stats: { calls: 0, injected: 0 },
		});
	});

	test('PATCH admin/chaos changes the settings it is given and keeps the rest', async () => {
		try {
			const first = await patch('/admin/chaos', {
				enabled: true,
				frequency: 2,
				status: 529,
			});

			expect(first.status).toBe(200);
			expect(first.body.chaos).toEqual({
				...chaosOff,
				enabled: true,
				frequency: 2,
				status: 529,
			});
			// Every 2nd call fails from here on
			expect(shouldInjectError()).toBe(false);
			expect(shouldInjectError()).toBe(true);

			const second = await patch('/admin/chaos', {
				mode: 'random',
				kind: 'stream-drop',
				afterChunks: 0,
			});

			expect(second.body).toEqual({
				chaos: {
					enabled: true,
					frequency: 2,
					mode: 'random',
					status: 529,
					kind: 'stream-drop',
					afterChunks: 0,
				},
				stats: { calls: 2, injected: 1 },
			});
			expect((await send('GET', '/admin/chaos')).body).toEqual(
				second.body,
			);
		} finally {
			await send('POST', '/admin/reset');
		}
	});

	test.each([
		['an array', [{ enabled: true }], /chaos must be a JSON object/],
		['an unknown setting', { rate: 2 }, /unknown settings: rate/],
		['enabled as text', { enabled: 'true' }, /chaos\.enabled must be true/],
		['a frequency of 0', { frequency: 0 }, /chaos\.frequency must be/],
		['a frequency with a fraction', { frequency: 1.5 }, /chaos\.frequency/],
		['an unknown mode', { mode: 'sometimes' }, /chaos\.mode must be/],
		['a status below 400', { status: 200 }, /chaos\.status must be/],
		['an unknown kind', { kind: 'slow' }, /chaos\.kind must be one of/],
		['a negative afterChunks', { afterChunks: -1 }, /chaos\.afterChunks/],
		[
			'one setting that is valid beside one that is not',
			{ enabled: true, status: 200 },
			/chaos\.status must be/,
		],
	])(
		'PATCH admin/chaos answers 400 for %s, and changes nothing',
		async (_name, payload, error) => {
			const { status, body } = await patch('/admin/chaos', payload);

			expect(status).toBe(400);
			expect(body.error).toMatch(error);
			expect((await send('GET', '/admin/chaos')).body.chaos).toEqual(
				chaosOff,
			);
		},
	);

	test('GET admin/delay reports the response delay', async () => {
		const { status, body } = await send('GET', '/admin/delay');

		expect(status).toBe(200);
		expect(body).toEqual({ delay: { min: 0, max: 0 } });
	});

	test('PATCH admin/delay changes the response delay', async () => {
		try {
			const both = await patch('/admin/delay', { min: 100, max: 250 });

			expect(both.status).toBe(200);
			expect(both.body).toEqual({ delay: { min: 100, max: 250 } });
			expect(getDelayConfig()).toEqual({
				min: 100,
				max: 250,
				enabled: true,
			});

			// One of the two, when the other still fits
			const one = await patch('/admin/delay', { max: 400 });

			expect(one.body).toEqual({ delay: { min: 100, max: 400 } });
		} finally {
			await send('POST', '/admin/reset');
		}
	});

	test.each([
		['an array', [{ min: 1 }], /delay must be a JSON object/],
		['an unknown setting', { minimum: 5 }, /unknown settings: minimum/],
		['a negative delay', { min: -1, max: 5 }, /delay\.min must be/],
		['a delay as text', { max: '500' }, /delay\.max must be/],
		['a fraction', { min: 0.5, max: 5 }, /delay\.min must be/],
		[
			'a delay longer than a timer can hold',
			{ min: 0, max: 2_147_483_648 },
			/delay\.max must be an integer from 0 to 2147483647/,
		],
		['a min above the max', { min: 500, max: 100 }, /can not be more than/],
		['a min above the max in use', { min: 500 }, /can not be more than/],
	])(
		'PATCH admin/delay answers 400 for %s, and changes nothing',
		async (_name, payload, error) => {
			const { status, body } = await patch('/admin/delay', payload);

			expect(status).toBe(400);
			expect(body.error).toMatch(error);
			expect((await send('GET', '/admin/delay')).body).toEqual({
				delay: { min: 0, max: 0 },
			});
		},
	);

	test('POST admin/reset goes back to how the server started', async () => {
		await addRule({ match: 'ONE', text: 'one' });
		await patch('/admin/chaos', { enabled: true, frequency: 2 });
		await patch('/admin/delay', { min: 50, max: 50 });
		shouldInjectError();
		shouldInjectError();
		expect(getChaosStats()).toEqual({ calls: 2, injected: 1 });

		const { status, body } = await send('POST', '/admin/reset');

		expect(status).toBe(200);
		expect(body).toEqual({
			rules: configRules,
			chaos: chaosOff,
			stats: { calls: 0, injected: 0 },
			delay: { min: 0, max: 0 },
		});
		expect(shouldInjectError()).toBe(false);
	});

	test('a reset then a change has the chaos count start from 0', async () => {
		try {
			await patch('/admin/chaos', { enabled: true, frequency: 3 });
			shouldInjectError();

			await send('POST', '/admin/reset');
			await patch('/admin/chaos', { enabled: true, frequency: 2 });

			// The 2nd call is the one that fails, whatever was counted before
			expect(shouldInjectError()).toBe(false);
			expect(shouldInjectError()).toBe(true);
		} finally {
			await send('POST', '/admin/reset');
		}
	});

	test('an id is not given out again after a reset', async () => {
		const before = await addRule({ match: 'ONE', text: 'one' });
		await send('POST', '/admin/reset');
		const after = await addRule({ match: 'ONE', text: 'one' });

		expect(after.body.rule.id).not.toBe(before.body.rule.id);
	});

	test('the admin API is on unless ADMIN_API reads as off', () => {
		const before = process.env.ADMIN_API;
		try {
			delete process.env.ADMIN_API;
			expect(adminApiEnabled()).toBe(true);

			for (const value of ['true', 'TRUE', '1', 'on', '']) {
				process.env.ADMIN_API = value;
				expect(adminApiEnabled()).toBe(true);
			}

			for (const value of ['false', 'False', 'FALSE', '0', 'off', 'no']) {
				process.env.ADMIN_API = value;
				expect(adminApiEnabled()).toBe(false);
			}
		} finally {
			if (before === undefined) delete process.env.ADMIN_API;
			else process.env.ADMIN_API = before;
		}
	});
});
