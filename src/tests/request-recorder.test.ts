import { afterEach, describe, expect, test } from 'vitest';
import {
	startServer,
	type LlmMockConfig,
	type RecordedRequest,
	type RunningServer,
} from '../index.js';
import { maxRecordedRequests } from '../utilities/request-recorder.js';

const preset = {
	name: 'claude',
	model: 'claude-opus-5-5',
	endpoint: 'v1/messages',
	responseType: 'lorem',
	maxLoremParas: 1,
	validateRequests: true,
	logRequests: false,
	debug: false,
	stream: false,
	responseDelay: { min: 0, max: 0 },
	embeddings: { enabled: true, dimensions: 8 },
	responseRules: [
		{ match: 'WANT_RULE', text: 'from the rule' },
		{ match: 'WANT_FAIL', fail: { status: 503 } },
	],
};

const config: LlmMockConfig = {
	defaultModel: 'claude',
	models: { claude: preset },
	server: { port: 8001, host: '0.0.0.0' },
} as LlmMockConfig;

const post = (
	server: RunningServer,
	path: string,
	body: unknown,
	headers: Record<string, string> = {},
) =>
	fetch(`${server.url}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
	});

const ask = (
	server: RunningServer,
	messages: Array<{ role: string; content: string }>,
	extra: Record<string, unknown> = {},
	headers?: Record<string, string>,
) =>
	post(
		server,
		'/v1/messages',
		{ model: 'claude-opus-5-5', max_tokens: 50, messages, ...extra },
		headers,
	);

const admin = async (server: RunningServer, route: string, method = 'GET') => {
	const response = await fetch(`${server.url}/admin/${route}`, { method });
	return { status: response.status, body: (await response.json()) as any };
};

describe('recorded requests', () => {
	let server: RunningServer | undefined;

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	test('a key in the query string is redacted, other parameters kept', async () => {
		server = await startServer({ config, port: 0 });
		await (
			await post(
				server,
				'/v1/messages?key=AIza-secret&API_KEY=other&beta=true',
				{
					model: 'claude-opus-5-5',
					max_tokens: 50,
					messages: [{ role: 'user', content: 'hi' }],
				},
			)
		).text();

		expect(server.lastRequest()?.query).toEqual({
			key: '[redacted]',
			API_KEY: '[redacted]',
			beta: 'true',
		});
		const { body } = await admin(server, 'requests');
		expect(JSON.stringify(body)).not.toContain('secret');
	});

	test('records each call, oldest first, with its id, body and headers', async () => {
		server = await startServer({ config, port: 0 });

		const first = await ask(
			server,
			[{ role: 'user', content: 'hello there' }],
			{},
			{ 'x-api-key': 'sk-secret', 'anthropic-version': '2023-06-01' },
		);
		await first.text();
		await (
			await ask(server, [{ role: 'user', content: 'WANT_RULE' }])
		).text();

		const requests = server.requests();
		expect(requests).toHaveLength(2);

		const [entry] = requests;
		expect(entry.id).toBe(first.headers.get('x-llmock-request-id'));
		expect(entry.method).toBe('POST');
		expect(entry.path).toBe('/v1/messages');
		expect(entry.body).toMatchObject({
			messages: [{ role: 'user', content: 'hello there' }],
		});
		expect(entry.headers['anthropic-version']).toBe('2023-06-01');
		// A key sent by mistake is never shown
		expect(entry.headers['x-api-key']).toBe('[redacted]');
		expect(entry.query).toEqual({});
		expect(entry).toMatchObject({
			valid: true,
			streamed: false,
			rule: null,
			failed: null,
		});
		expect(Number.isNaN(Date.parse(entry.time))).toBe(false);

		expect(requests[1].rule).toEqual({ id: null, match: 'WANT_RULE' });
		expect(server.lastRequest()?.id).toBe(requests[1].id);
	});

	test('GET /admin/requests gives the same, and filters like a rule', async () => {
		server = await startServer({ config, port: 0 });

		await (
			await ask(server, [
				{ role: 'user', content: 'Plan a picnic' },
				{ role: 'assistant', content: 'Where?' },
				{ role: 'user', content: 'In Paris' },
			])
		).text();
		await (await ask(server, [{ role: 'user', content: 'other' }])).text();

		const all = await admin(server, 'requests');
		expect(all.status).toBe(200);
		expect(all.body.requests).toEqual(server.requests());

		const picnic = await admin(server, 'requests?match=picnic');
		expect(picnic.body.requests).toHaveLength(1);
		// Only in an earlier turn, so not in the last message
		const last = await admin(server, 'requests?match=picnic&in=last');
		expect(last.body.requests).toHaveLength(0);
		expect(server.requests({ match: 'Paris', in: 'last' })).toHaveLength(1);

		const byPath = await admin(server, 'requests?path=/v1/embeddings');
		expect(byPath.body.requests).toHaveLength(0);

		const one = await admin(server, `requests/${all.body.requests[1].id}`);
		expect(one.body.request).toEqual(all.body.requests[1]);
		expect((await admin(server, 'requests/nope')).status).toBe(404);

		const bad = await admin(server, 'requests?in=first');
		expect(bad.status).toBe(400);
		expect(bad.body.error).toMatch(/in must be/);
		expect((await admin(server, 'requests?colour=red')).status).toBe(400);
		expect(() => server!.requests({ match: '' })).toThrow(/match/);
	});

	test('records calls that fail validation, a rule or chaos, and streams', async () => {
		server = await startServer({ config, port: 0 });

		// No max_tokens, which the claude request template requires
		const invalid = await post(server, '/v1/messages', {
			model: 'claude-opus-5-5',
			messages: [{ role: 'user', content: 'x' }],
		});
		expect(invalid.status).toBe(400);
		await invalid.text();

		const failed = await ask(server, [
			{ role: 'user', content: 'WANT_FAIL' },
		]);
		expect(failed.status).toBe(503);
		await failed.text();

		await (
			await ask(server, [{ role: 'user', content: 'hi' }], {
				stream: true,
			})
		).text();

		const [first, second, third] = server.requests();
		expect(first).toMatchObject({ valid: false, streamed: null });
		expect(second).toMatchObject({
			rule: { id: null, match: 'WANT_FAIL' },
			failed: { by: 'rule', kind: 'http', status: 503 },
			streamed: false,
		});
		expect(third).toMatchObject({ streamed: true, failed: null });

		await fetch(`${server.url}/admin/chaos`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ enabled: true, status: 429 }),
		});
		const chaos = await ask(server, [
			{ role: 'user', content: 'WANT_RULE' },
		]);
		expect(chaos.status).toBe(429);
		await chaos.text();
		// The rule did not answer it: chaos failed it first
		expect(server.lastRequest()).toMatchObject({
			rule: null,
			failed: { by: 'chaos', kind: 'http', status: 429 },
		});
	});

	test('a runtime rule is reported by its id', async () => {
		server = await startServer({ config, port: 0 });
		await fetch(`${server.url}/admin/rules`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ match: 'RUNTIME', text: 'r', times: 1 }),
		});

		await (
			await ask(server, [{ role: 'user', content: 'RUNTIME' }])
		).text();
		expect(server.lastRequest()?.rule).toEqual({
			id: 'r1',
			match: 'RUNTIME',
		});
	});

	test('records embeddings calls too', async () => {
		server = await startServer({ config, port: 0 });

		await (
			await post(server, '/v1/embeddings', {
				model: 'text-embedding-3-small',
				input: 'some text',
			})
		).text();

		const [entry] = server.requests({ path: 'v1/embeddings' });
		expect(entry).toMatchObject({
			path: '/v1/embeddings',
			body: { input: 'some text' },
			streamed: false,
		});
	});

	test('clearing, a reset and a new server forget the calls', async () => {
		server = await startServer({ config, port: 0 });
		const hello = async () =>
			(await ask(server!, [{ role: 'user', content: 'hi' }])).text();

		await hello();
		server.clearRequests();
		expect(server.requests()).toEqual([]);

		await hello();
		expect(await admin(server, 'requests', 'DELETE')).toEqual({
			status: 200,
			body: { requests: [] },
		});
		expect(server.requests()).toEqual([]);

		await hello();
		await admin(server, 'reset', 'POST');
		expect(server.requests()).toEqual([]);

		await hello();
		await server.close();
		server = await startServer({ config, port: 0 });
		expect(server.requests()).toEqual([]);
	});

	test('a copy is returned, so a test can not change what is recorded', async () => {
		server = await startServer({ config, port: 0 });
		await (await ask(server, [{ role: 'user', content: 'hi' }])).text();

		const entry = server.lastRequest() as RecordedRequest;
		(entry.body as { model: string }).model = 'changed';
		expect(server.lastRequest()?.body).toMatchObject({
			model: 'claude-opus-5-5',
		});
	});

	test('works with the admin API off, and keeps only the most recent', async () => {
		server = await startServer({
			config,
			port: 0,
			settings: { admin: false, validateRequests: false },
		});
		expect((await fetch(`${server.url}/admin/requests`)).status).toBe(404);

		const calls = maxRecordedRequests + 3;
		for (let index = 0; index < calls; index++) {
			// eslint-disable-next-line no-await-in-loop
			await (
				await ask(server, [{ role: 'user', content: `call ${index}` }])
			).text();
		}

		const requests = server.requests();
		expect(requests).toHaveLength(maxRecordedRequests);
		expect(requests[0].body).toMatchObject({
			messages: [{ content: 'call 3' }],
		});
	}, 30_000);
});
