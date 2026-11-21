/* eslint-disable @typescript-eslint/naming-convention */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { startServer, type RunningServer } from '../../index.js';
import { extractReply, upstreamUrl } from '../../utilities/recordings.js';

// A stand-in for the real provider: answers each path with what the test
// set, and remembers what it was sent
type Answer = { status?: number; body: unknown };
const upstream = {
	server: undefined as Server | undefined,
	url: '',
	answers: new Map<string, Answer>(),
	calls: [] as Array<{
		path: string;
		headers: IncomingHttpHeaders;
		body: any;
	}>,
};

const preset = (name: string, endpoint: string) => ({
	name,
	model: 'mock',
	endpoint,
	responseType: 'lorem',
	maxLoremParas: 1,
	validateRequests: false,
	logRequests: false,
	debug: false,
	stream: false,
	responseDelay: { min: 0, max: 0 },
	embeddings: { enabled: false, dimensions: 8 },
	recordings: { dir: 'recordings' },
});

const claudeMessage = (content: unknown[], stop_reason = 'end_turn') => ({
	id: 'msg_real',
	type: 'message',
	role: 'assistant',
	model: 'claude-opus-5-5',
	content,
	stop_reason,
	stop_sequence: null,
	usage: { input_tokens: 5, output_tokens: 5 },
});

describe('recording and replaying', () => {
	let dir: string;
	let configPath: string;
	let server: RunningServer | undefined;

	beforeAll(async () => {
		upstream.server = createServer((request, response) => {
			let raw = '';
			request.on('data', (chunk) => (raw += chunk));
			request.on('end', () => {
				upstream.calls.push({
					path: request.url ?? '',
					headers: request.headers,
					body: raw ? JSON.parse(raw) : undefined,
				});
				const answer = upstream.answers.get(request.url ?? '') ?? {
					status: 404,
					body: { error: 'no answer set' },
				};
				response.writeHead(answer.status ?? 200, {
					'content-type': 'application/json',
				});
				response.end(JSON.stringify(answer.body));
			});
		});
		await new Promise<void>((done) =>
			upstream.server!.listen(0, '127.0.0.1', done),
		);
		upstream.url = `http://127.0.0.1:${(upstream.server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((done) => upstream.server?.close(done));
	});

	afterEach(async () => {
		await server?.close();
		server = undefined;
		rmSync(dir, { recursive: true, force: true });
	});

	// A fresh project folder with a config file, for each test
	const start = async (
		model: 'claude' | 'chatgpt' | 'stockgpt' | 'gemini',
		settings: Record<string, string | number | boolean> = {},
	) => {
		dir ??= '';
		if (!dir || !existsSync(dir)) {
			dir = mkdtempSync(join(tmpdir(), 'llmock-recordings-'));
			configPath = join(dir, '.llmockrc.json');
			writeFileSync(
				configPath,
				JSON.stringify({
					defaultModel: 'claude',
					models: {
						claude: preset('claude', 'v1/messages'),
						chatgpt: preset('openai', 'v1/chat/completions'),
						stockgpt: preset('openai', 'chatgpt/chat/completions'),
						gemini: preset(
							'gemini',
							'models/gemini-pro:generateContent',
						),
					},
					server: { port: 8001, host: '127.0.0.1' },
				}),
			);
		}

		upstream.calls = [];
		server = await startServer({
			config: configPath,
			model,
			port: 0,
			settings: { record: upstream.url, ...settings },
		});
		return server;
	};

	const post = async (path: string, body: unknown, headers = {}) => {
		const response = await fetch(`${server!.url}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify(body),
		});
		return { status: response.status, text: await response.text() };
	};

	const askClaude = (content: string, extra = {}, headers = {}) =>
		post(
			'/v1/messages',
			{
				model: 'claude-opus-5-5',
				max_tokens: 100,
				messages: [{ role: 'user', content }],
				...extra,
			},
			headers,
		);

	const recordedRules = () =>
		JSON.parse(
			readFileSync(join(dir, 'recordings', 'rules.json'), 'utf8'),
		) as Array<Record<string, unknown>>;

	test('records a call no rule answers, then replays it without the upstream', async () => {
		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'Real answer.' }]),
		});
		await start('claude');

		const first = await askClaude(
			'What is the capital of France?',
			{},
			{ 'x-api-key': 'sk-real', 'anthropic-version': '2023-06-01' },
		);
		expect(first.status).toBe(200);
		const reply = JSON.parse(first.text);
		// llmock's own message, with the recorded text
		expect(reply.content).toEqual([{ type: 'text', text: 'Real answer.' }]);
		expect(reply.id).not.toBe('msg_real');

		// The call went on as it came, credentials included
		expect(upstream.calls).toHaveLength(1);
		expect(upstream.calls[0].headers['x-api-key']).toBe('sk-real');
		expect(upstream.calls[0].headers['anthropic-version']).toBe(
			'2023-06-01',
		);
		expect(upstream.calls[0].body.messages[0].content).toBe(
			'What is the capital of France?',
		);
		expect(server!.lastRequest()?.forwarded).toEqual({
			status: 200,
			saved: true,
		});

		expect(recordedRules()).toEqual([
			{
				match: 'What is the capital of France?',
				in: 'last',
				exact: true,
				file: 'recordings/0001-what-is-the-capital-of-france.txt',
			},
		]);
		expect(
			readFileSync(
				join(
					dir,
					'recordings',
					'0001-what-is-the-capital-of-france.txt',
				),
				'utf8',
			),
		).toBe('Real answer.');

		// The same call again: answered from the recording
		const second = await askClaude('What is the capital of France?');
		expect(JSON.parse(second.text).content[0].text).toBe('Real answer.');
		expect(upstream.calls).toHaveLength(1);
		expect(server!.lastRequest()).toMatchObject({
			forwarded: null,
			rule: { id: null, match: 'What is the capital of France?' },
		});

		// After a restart with no upstream: replayed, listed as recorded
		await server!.close();
		await start('claude', { record: '' });
		const replayed = await askClaude('What is the capital of France?');
		expect(JSON.parse(replayed.text).content[0].text).toBe('Real answer.');
		expect(upstream.calls).toHaveLength(0);

		const { rules } = (await (
			await fetch(`${server!.url}/admin/rules`)
		).json()) as { rules: Array<{ source: string; match: string }> };
		expect(rules).toEqual([
			expect.objectContaining({
				source: 'recorded',
				match: 'What is the capital of France?',
			}),
		]);
		// The dashboard can show its file
		const file = (await (
			await fetch(`${server!.url}/ui-rule-file?rule=0&file=0`)
		).json()) as { content: string };
		expect(file.content).toBe('Real answer.');

		// With no upstream, a call nothing matches gets a generated reply
		const other = await askClaude('Something new');
		expect(other.status).toBe(200);
		expect(upstream.calls).toHaveLength(0);
	});

	test('the dashboard is told whether the server records or replays, and what was sent on', async () => {
		const recording = async () =>
			(
				(await (await fetch(`${server!.url}/ui-meta`)).json()) as {
					recording: unknown;
				}
			).recording;

		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'Counted.' }]),
		});
		await start('claude');
		const before = (await recording()) as {
			forwarded: number;
			saved: number;
		};
		expect(before).toMatchObject({
			mode: 'record',
			upstream: upstream.url,
			dir: 'recordings',
		});

		await askClaude('Count me');
		await askClaude('Count me'); // replayed: not sent on
		upstream.answers.set('/v1/messages', { status: 500, body: {} });
		await askClaude('Fail me');

		expect(await recording()).toEqual({
			mode: 'record',
			paused: false,
			upstream: upstream.url,
			dir: 'recordings',
			forwarded: before.forwarded + 2,
			saved: before.saved + 1,
		});

		// The recorded rule is marked as one
		const meta = (await (await fetch(`${server!.url}/ui-meta`)).json()) as {
			responseRules: Array<{ source: string }>;
		};
		expect(meta.responseRules.map((rule) => rule.source)).toEqual([
			'recorded',
		]);

		// With no upstream: replay only
		await server!.close();
		await start('claude', { record: '' });
		expect(await recording()).toMatchObject({
			mode: 'replay',
			upstream: null,
			dir: 'recordings',
		});
	});

	test('recording can be paused and resumed through the admin API, and a reset resumes it', async () => {
		const patch = async (body: unknown) => {
			const response = await fetch(`${server!.url}/admin/recording`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});
			return {
				status: response.status,
				body: (await response.json()) as any,
			};
		};

		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'Recorded before.' }]),
		});
		await start('claude');
		await askClaude('Before the pause');
		expect(upstream.calls).toHaveLength(1);

		const paused = await patch({ paused: true });
		expect(paused.status).toBe(200);
		expect(paused.body.recording).toMatchObject({
			mode: 'record',
			paused: true,
		});

		// Nothing is sent on or saved; the recorded rule still answers
		const mocked = await askClaude('During the pause');
		expect(mocked.status).toBe(200);
		expect(mocked.text).not.toContain('Recorded before.');
		expect((await askClaude('Before the pause')).text).toContain(
			'Recorded before.',
		);
		expect(upstream.calls).toHaveLength(1);
		expect(recordedRules()).toHaveLength(1);

		const shown = (await (
			await fetch(`${server!.url}/admin/recording`)
		).json()) as any;
		expect(shown.recording.paused).toBe(true);

		// Resumed by a PATCH
		expect((await patch({ paused: false })).body.recording.paused).toBe(
			false,
		);
		await askClaude('After the pause');
		expect(upstream.calls).toHaveLength(2);

		// And by a reset
		await patch({ paused: true });
		const reset = (await (
			await fetch(`${server!.url}/admin/reset`, { method: 'POST' })
		).json()) as any;
		expect(reset.recording.paused).toBe(false);

		// A change that isn't { paused: boolean } is refused
		for (const bad of [
			{ paused: 'yes' },
			{},
			{ paused: true, upstream: 'x' },
		]) {
			const refused = await patch(bad);
			expect(refused.status).toBe(400);
			expect(refused.body.error).toContain('paused');
		}
	});

	test('a server that only replays has no recording to pause', async () => {
		await start('claude', { record: '' });
		const response = await fetch(`${server!.url}/admin/recording`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ paused: true }),
		});
		expect(response.status).toBe(400);
		expect(((await response.json()) as any).error).toContain(
			'not recording',
		);
	});

	test('the stock chatgpt and gemini presets record from the provider paths', async () => {
		upstream.answers.set('/v1/chat/completions', {
			body: {
				choices: [
					{
						index: 0,
						message: { role: 'assistant', content: 'From OpenAI.' },
						finish_reason: 'stop',
					},
				],
			},
		});
		await start('stockgpt');
		const openai = await post('/chatgpt/chat/completions', {
			model: 'gpt-4o',
			messages: [{ role: 'user', content: 'Stock path' }],
		});
		expect(JSON.parse(openai.text).choices[0].message.content).toBe(
			'From OpenAI.',
		);
		expect(upstream.calls.map((call) => call.path)).toEqual([
			'/v1/chat/completions',
		]);
		await server!.close();

		upstream.answers.set(
			'/v1beta/models/gemini-pro:generateContent?key=k',
			{
				body: {
					candidates: [
						{
							content: {
								role: 'model',
								parts: [{ text: 'From Gemini.' }],
							},
							finishReason: 'STOP',
						},
					],
				},
			},
		);
		await start('gemini');
		const gemini = await post('/models/gemini-pro:generateContent?key=k', {
			contents: [
				{ role: 'user', parts: [{ text: 'Stock Gemini path' }] },
			],
		});
		expect(gemini.status).toBe(200);
		expect(upstream.calls.map((call) => call.path)).toEqual([
			'/v1beta/models/gemini-pro:generateContent?key=k',
		]);
	});

	test('a rules file broken while running is skipped, and never written over', async () => {
		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'Saved.' }]),
		});
		await start('claude');
		await askClaude('Keep me');
		const rulesPath = join(dir, 'recordings', 'rules.json');
		const broken = readFileSync(rulesPath, 'utf8').replace(/\]\s*$/, ',]');
		writeFileSync(rulesPath, broken);

		// Calls, the rules listing and a reset still work
		const { status } = await askClaude('Something else');
		expect(status).toBe(200);
		expect((await fetch(`${server!.url}/admin/rules`)).status).toBe(200);
		expect(
			(await fetch(`${server!.url}/admin/reset`, { method: 'POST' }))
				.status,
		).toBe(200);

		// The reply came from the upstream but wasn't saved over the broken file
		expect(upstream.calls).toHaveLength(2);
		expect(readFileSync(rulesPath, 'utf8')).toBe(broken);

		// Mended: the recorded rule answers again
		writeFileSync(rulesPath, broken.replace(',]', ']'));
		const replayed = await askClaude('Keep me');
		expect(JSON.parse(replayed.text).content[0].text).toBe('Saved.');
		expect(upstream.calls).toHaveLength(2);
	});

	test('a new recording never reuses the name of a fixture already there', async () => {
		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'One.' }]),
		});
		await start('claude');
		await askClaude('hi');
		await askClaude('hi there');
		const rulesPath = join(dir, 'recordings', 'rules.json');

		// The first rule is removed by hand; its fixture stays
		const [, second] = recordedRules();
		writeFileSync(rulesPath, JSON.stringify([second]));

		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'Three.' }]),
		});
		await askClaude('hi again');
		expect(recordedRules().map((rule) => rule.file)).toEqual([
			'recordings/0002-hi-there.txt',
			'recordings/0003-hi-again.txt',
		]);
		expect(
			readFileSync(join(dir, 'recordings', '0002-hi-there.txt'), 'utf8'),
		).toBe('One.');
	});

	test('the dashboard is not shown a user name or password in the upstream URL', async () => {
		const withLogin = upstream.url.replace(
			'http://',
			'http://user:secret@',
		);
		await start('claude', { record: withLogin });

		const { recording } = (await (
			await fetch(`${server!.url}/ui-meta`)
		).json()) as { recording: { upstream: string } };
		expect(recording.upstream).toBe(upstream.url);
	});

	test('a streamed call is recorded from a whole reply and streamed by llmock', async () => {
		upstream.answers.set('/v1/messages', {
			body: claudeMessage([
				{ type: 'text', text: 'Streamed real answer.' },
			]),
		});
		await start('claude');

		const streamed = await askClaude('Stream it', { stream: true });
		expect(streamed.text).toContain('event: message_start');
		const text = [...streamed.text.matchAll(/"text":"([^"]*)"/g)]
			.map((found) => found[1])
			.join('');
		expect(text).toBe('Streamed real answer.');
		expect(upstream.calls[0].body.stream).toBe(false);
		expect(server!.lastRequest()?.streamed).toBe(true);
	});

	test('an error from the upstream is sent back as it came and not saved', async () => {
		upstream.answers.set('/v1/messages', {
			status: 401,
			body: { type: 'error', error: { type: 'authentication_error' } },
		});
		await start('claude');

		const reply = await askClaude('Who am I?');
		expect(reply.status).toBe(401);
		expect(JSON.parse(reply.text).error.type).toBe('authentication_error');
		expect(existsSync(join(dir, 'recordings', 'rules.json'))).toBe(false);
		expect(server!.lastRequest()?.forwarded).toEqual({
			status: 401,
			saved: false,
		});
	});

	test('tool calls are recorded as a contentFile and replayed with new ids', async () => {
		upstream.answers.set('/v1/messages', {
			body: claudeMessage(
				[
					{ type: 'thinking', thinking: 'hmm', signature: 'x' },
					{ type: 'text', text: 'Checking.' },
					{
						type: 'tool_use',
						id: 'toolu_real',
						name: 'get_weather',
						input: { city: 'Paris' },
					},
				],
				'tool_use',
			),
		});
		await start('claude');

		const first = JSON.parse((await askClaude('Weather in Paris?')).text);
		expect(first.stop_reason).toBe('tool_use');
		expect(first.content[1]).toMatchObject({
			type: 'tool_use',
			name: 'get_weather',
			input: { city: 'Paris' },
		});

		const [rule] = recordedRules();
		expect(rule).toEqual({
			match: 'Weather in Paris?',
			in: 'last',
			exact: true,
			contentFile: 'recordings/0001-weather-in-paris.json',
		});
		expect(
			JSON.parse(
				readFileSync(
					join(dir, 'recordings', '0001-weather-in-paris.json'),
					'utf8',
				),
			),
		).toEqual([
			{ type: 'text', text: 'Checking.' },
			{ type: 'tool_use', name: 'get_weather', input: { city: 'Paris' } },
		]);

		const again = JSON.parse((await askClaude('Weather in Paris?')).text);
		expect(again.content[1].id).toMatch(/^toolu_/);
		expect(again.content[1].id).not.toBe('toolu_real');
		expect(upstream.calls).toHaveLength(1);
	});

	test('a recorded tool loop replays: the tool_result turn matches whatever its tool_use_id', async () => {
		const resultTurn = (id: string) => ({
			model: 'claude-opus-5-5',
			max_tokens: 100,
			messages: [
				{ role: 'user', content: 'Weather in Paris?' },
				{
					role: 'assistant',
					content: [
						{
							type: 'tool_use',
							id,
							name: 'get_weather',
							input: {},
						},
					],
				},
				{
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: id,
							content: '21C',
						},
					],
				},
			],
		});

		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'It is 21C.' }]),
		});
		await start('claude');
		await post('/v1/messages', resultTurn('toolu_first'));
		expect(recordedRules()[0]).toMatchObject({ match: 'tool_result\n21C' });

		// A replay gives the tool call a new id, which the client sends back
		const replayed = await post('/v1/messages', resultTurn('toolu_second'));
		expect(JSON.parse(replayed.text).content[0].text).toBe('It is 21C.');
		expect(upstream.calls).toHaveLength(1);
		expect(recordedRules()).toHaveLength(1);
	});

	test('a recording answers only the same last message, not one that contains it', async () => {
		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'Hello!' }]),
		});
		await start('claude');
		await askClaude('Hi');

		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'Summary.' }]),
		});
		const longer = await askClaude('Hi, summarise this');
		expect(JSON.parse(longer.text).content[0].text).toBe('Summary.');
		expect(upstream.calls).toHaveLength(2);
		expect(recordedRules()).toHaveLength(2);
	});

	test('OpenAI chat: a cut-off reply keeps its stop reason', async () => {
		upstream.answers.set('/v1/chat/completions', {
			body: {
				id: 'chatcmpl-real',
				object: 'chat.completion',
				choices: [
					{
						index: 0,
						message: { role: 'assistant', content: 'Cut off he' },
						finish_reason: 'length',
					},
				],
			},
		});
		await start('chatgpt');

		const ask = () =>
			post('/v1/chat/completions', {
				model: 'gpt-4o',
				messages: [{ role: 'user', content: 'Tell me a long story' }],
			});
		const first = JSON.parse((await ask()).text);
		expect(first.choices[0]).toMatchObject({
			message: { content: 'Cut off he' },
			finish_reason: 'length',
		});
		expect(recordedRules()[0]).toMatchObject({ stopReason: 'max_tokens' });

		const again = JSON.parse((await ask()).text);
		expect(again.choices[0].finish_reason).toBe('length');
		expect(upstream.calls).toHaveLength(1);
	});

	test('OpenAI tool calls are passed through and not saved', async () => {
		const body = {
			choices: [
				{
					index: 0,
					message: {
						role: 'assistant',
						content: null,
						tool_calls: [{ id: 'call_1', type: 'function' }],
					},
					finish_reason: 'tool_calls',
				},
			],
		};
		upstream.answers.set('/v1/chat/completions', { body });
		await start('chatgpt');

		const reply = await post('/v1/chat/completions', {
			model: 'gpt-4o',
			messages: [{ role: 'user', content: 'Call a tool' }],
		});
		expect(JSON.parse(reply.text)).toEqual(body);
		expect(existsSync(join(dir, 'recordings', 'rules.json'))).toBe(false);

		// A client that asked for a stream can't read that reply: a 502 says why
		const streamed = await post('/v1/chat/completions', {
			model: 'gpt-4o',
			stream: true,
			messages: [{ role: 'user', content: 'Call a tool' }],
		});
		expect(streamed.status).toBe(502);
		expect(JSON.parse(streamed.text).error).toMatchObject({
			type: 'llmock_upstream',
			message: expect.stringContaining(
				'OpenAI tool calls are not recorded',
			),
		});

		// An error status still reaches a streaming client as it came
		upstream.answers.set('/v1/chat/completions', {
			status: 429,
			body: { error: { message: 'slow down' } },
		});
		const limited = await post('/v1/chat/completions', {
			model: 'gpt-4o',
			stream: true,
			messages: [{ role: 'user', content: 'Call a tool' }],
		});
		expect(limited.status).toBe(429);
		expect(JSON.parse(limited.text)).toEqual({
			error: { message: 'slow down' },
		});
	});

	test('Gemini function calls are passed through and not saved', async () => {
		const body = {
			candidates: [
				{
					content: {
						role: 'model',
						parts: [
							{ functionCall: { name: 'get_weather', args: {} } },
						],
					},
					finishReason: 'STOP',
				},
			],
		};
		upstream.answers.set('/v1beta/models/gemini-pro:generateContent', {
			body,
		});
		await start('gemini');

		const reply = await post('/models/gemini-pro:generateContent', {
			contents: [{ role: 'user', parts: [{ text: 'Call a tool' }] }],
		});
		expect(JSON.parse(reply.text)).toEqual(body);
		expect(existsSync(join(dir, 'recordings', 'rules.json'))).toBe(false);
	});

	test('the Responses API route records too', async () => {
		upstream.answers.set('/v1/responses', {
			body: {
				object: 'response',
				status: 'completed',
				output: [
					{
						type: 'message',
						role: 'assistant',
						content: [
							{ type: 'output_text', text: 'From responses.' },
						],
					},
				],
			},
		});
		await start('chatgpt');

		const ask = () =>
			post('/v1/responses', {
				model: 'gpt-4o',
				input: 'Responses question',
			});
		expect(JSON.parse((await ask()).text).output[0].content[0].text).toBe(
			'From responses.',
		);
		expect(JSON.parse((await ask()).text).output[0].content[0].text).toBe(
			'From responses.',
		);
		expect(upstream.calls).toHaveLength(1);
		expect(upstream.calls[0].path).toBe('/v1/responses');
	});

	test('a rule that matches is answered, not forwarded', async () => {
		await start('claude');
		await fetch(`${server!.url}/admin/rules`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ match: 'KNOWN', text: 'from a rule' }),
		});

		const reply = JSON.parse((await askClaude('KNOWN question')).text);
		expect(reply.content[0].text).toBe('from a rule');
		expect(upstream.calls).toHaveLength(0);
	});

	test('an upstream that can not be reached gets a 502', async () => {
		await start('claude', { record: 'http://127.0.0.1:1' });

		const reply = await askClaude('Anyone there?');
		expect(reply.status).toBe(502);
		expect(JSON.parse(reply.text).error.message).toMatch(
			/could not reach the recording upstream/,
		);
	});

	test('a bad upstream or recordings file stops the server starting', async () => {
		await expect(start('claude', { record: 'not a url' })).rejects.toThrow(
			/recordings.upstream must be an http or https URL/,
		);
		server = undefined;

		mkdirSync(join(dir, 'recordings'), { recursive: true });
		writeFileSync(join(dir, 'recordings', 'rules.json'), '[{"match": ""}]');
		await expect(start('claude')).rejects.toThrow(/rules\.json.*match/);
		server = undefined;
	});

	test('several recordings are numbered in order', async () => {
		upstream.answers.set('/v1/messages', {
			body: claudeMessage([{ type: 'text', text: 'ok' }]),
		});
		await start('claude');

		await askClaude('first');
		await askClaude('second');
		expect(recordedRules().map((rule) => rule.file)).toEqual([
			'recordings/0001-first.txt',
			'recordings/0002-second.txt',
		]);
		expect(readdirSync(join(dir, 'recordings')).sort()).toEqual([
			'0001-first.txt',
			'0002-second.txt',
			'rules.json',
		]);
	});
});

describe('extractReply', () => {
	test('reads each format, with its stop reasons', () => {
		expect(
			extractReply(
				'claude',
				claudeMessage([{ type: 'text', text: 'a' }], 'refusal'),
			),
		).toEqual({ text: 'a', stopReason: 'refusal' });
		expect(
			extractReply('openai', {
				choices: [{ message: { content: null, refusal: 'no' } }],
			}),
		).toEqual({ text: 'no', stopReason: 'refusal' });
		expect(
			extractReply('responses', {
				status: 'incomplete',
				output: [
					{ type: 'reasoning' },
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'part' }],
					},
				],
			}),
		).toEqual({ text: 'part', stopReason: 'max_tokens' });
		expect(
			extractReply('gemini', {
				candidates: [
					{
						content: { parts: [{ text: 'g' }, { text: 'h' }] },
						finishReason: 'STOP',
					},
				],
			}),
		).toEqual({ text: 'gh' });
		expect(extractReply('custom', {})).toMatch(/not recorded/);
		expect(extractReply('openai', { nope: true })).toMatch(/no choices/);
	});
});

describe('upstreamUrl', () => {
	test('sends each format to the provider path, keeping the query', () => {
		const base = 'https://api.example.com';
		expect(upstreamUrl(base, 'claude', '/anything')).toBe(
			`${base}/v1/messages`,
		);
		expect(upstreamUrl(base, 'openai', '/chatgpt/chat/completions')).toBe(
			`${base}/v1/chat/completions`,
		);
		expect(upstreamUrl(base, 'responses', '/chatgpt/responses')).toBe(
			`${base}/v1/responses`,
		);
		expect(
			upstreamUrl(
				base,
				'gemini',
				'/models/gemini-pro:generateContent?key=k',
			),
		).toBe(`${base}/v1beta/models/gemini-pro:generateContent?key=k`);
	});

	test('does not repeat a version the upstream already ends with', () => {
		expect(
			upstreamUrl(
				'https://api.openai.com/v1/',
				'openai',
				'/x/chat/completions',
			),
		).toBe('https://api.openai.com/v1/chat/completions');
		expect(
			upstreamUrl(
				'https://generativelanguage.googleapis.com/v1beta',
				'gemini',
				'/v1beta/models/m:generateContent',
			),
		).toBe(
			'https://generativelanguage.googleapis.com/v1beta/models/m:generateContent',
		);
	});

	test('keeps a prefix on the upstream, and the call path for other formats', () => {
		expect(
			upstreamUrl(
				'http://proxy:9000/anthropic',
				'claude',
				'/v1/messages',
			),
		).toBe('http://proxy:9000/anthropic/v1/messages');
		expect(upstreamUrl('http://proxy', 'custom', '/my/route?a=1')).toBe(
			'http://proxy/my/route?a=1',
		);
	});
});
