/* eslint-disable @typescript-eslint/naming-convention */
import OpenAI from 'openai';
import { afterEach, describe, expect, test } from 'vitest';
import {
	startServer,
	type LlmMockConfig,
	type RunningServer,
} from '../../index.js';

// Checked against the OpenAI TypeScript SDK's client.responses, which is what
// apps calling the Responses API use
const preset = {
	name: 'openai',
	model: 'gpt-4o',
	endpoint: 'v1/chat/completions',
	responseType: 'lorem',
	maxLoremParas: 2,
	validateRequests: true,
	logRequests: false,
	debug: false,
	stream: false,
	responseDelay: { min: 0, max: 0 },
	embeddings: { enabled: false, dimensions: 8 },
	responseRules: [
		{ match: 'WANT_TEXT', text: 'The answer is forty two, as ever.' },
		{ match: 'sunny', in: 'last', text: 'Take the picnic to the park.' },
		{
			match: 'WANT_CUT',
			text: 'This reply stops part of the way',
			stopReason: 'max_tokens',
		},
		{
			match: 'WANT_REFUSAL',
			text: 'I can not help.',
			stopReason: 'refusal',
		},
		{
			match: 'WANT_STREAM_ERROR',
			text: 'one two three four five six seven eight nine ten',
			fail: { kind: 'stream-error', status: 529, afterChunks: 1 },
		},
	],
};

const config = {
	defaultModel: 'chatgpt',
	models: {
		chatgpt: preset,
		claude: {
			...preset,
			name: 'claude',
			model: 'claude-opus-5-5',
			endpoint: 'v1/messages',
			responseRules: [],
		},
	},
	server: { port: 8001, host: '0.0.0.0' },
} as LlmMockConfig;

describe('OpenAI Responses API (/v1/responses)', () => {
	let server: RunningServer | undefined;

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	const start = async (settings = {}) => {
		server = await startServer({ config, port: 0, settings });
		return new OpenAI({
			apiKey: 'mock',
			baseURL: `${server.url}/v1`,
			maxRetries: 0,
		});
	};

	test('responses.create gets a rule reply, the model, instructions and usage', async () => {
		const client = await start();

		const response = await client.responses.create({
			model: 'gpt-5.1',
			instructions: 'Answer briefly.',
			input: 'WANT_TEXT: what is the answer?',
			max_output_tokens: 100,
			metadata: { test: 'yes' },
		});

		expect(response.id).toMatch(/^resp_[0-9a-f]{48}$/);
		expect(response.object).toBe('response');
		expect(response.status).toBe('completed');
		expect(response.model).toBe('gpt-5.1');
		expect(response.instructions).toBe('Answer briefly.');
		expect(response.max_output_tokens).toBe(100);
		expect(response.metadata).toEqual({ test: 'yes' });
		expect(response.output_text).toBe('The answer is forty two, as ever.');

		const [item] = response.output;
		expect(item).toMatchObject({
			type: 'message',
			role: 'assistant',
			status: 'completed',
			content: [
				{
					type: 'output_text',
					text: 'The answer is forty two, as ever.',
					annotations: [],
				},
			],
		});
		expect(response.usage?.input_tokens).toBeGreaterThan(0);
		expect(response.usage?.output_tokens).toBeGreaterThan(0);
		expect(response.usage?.total_tokens).toBe(
			response.usage!.input_tokens + response.usage!.output_tokens,
		);
	});

	test('a list of input items, matched with in: "last"', async () => {
		const client = await start();

		const response = await client.responses.create({
			model: 'gpt-4o',
			input: [
				{ role: 'user', content: 'Plan a picnic' },
				{ role: 'assistant', content: 'What is the weather?' },
				{
					role: 'user',
					content: [{ type: 'input_text', text: 'It is sunny' }],
				},
			],
		});
		expect(response.output_text).toBe('Take the picnic to the park.');

		// "sunny" only in an earlier item: no match, a generated reply
		const other = await client.responses.create({
			model: 'gpt-4o',
			input: [
				{ role: 'user', content: 'It is sunny' },
				{ role: 'user', content: 'Now what?' },
			],
		});
		expect(other.output_text).not.toBe('Take the picnic to the park.');
		expect(other.output_text.length).toBeGreaterThan(0);
	});

	test('streams the events the SDK rebuilds the response from', async () => {
		const client = await start();

		const stream = client.responses.stream({
			model: 'gpt-4o',
			input: 'WANT_TEXT',
		});
		const types: string[] = [];
		const deltas: string[] = [];
		const sequence: number[] = [];
		for await (const event of stream) {
			types.push(event.type);
			sequence.push(event.sequence_number);
			if (event.type === 'response.output_text.delta') {
				deltas.push(event.delta);
			}
		}

		const final = await stream.finalResponse();
		expect(final.output_text).toBe('The answer is forty two, as ever.');
		expect(final.status).toBe('completed');
		expect(final.usage?.output_tokens).toBeGreaterThan(0);
		expect(deltas.join('')).toBe('The answer is forty two, as ever.');
		expect(deltas.length).toBeGreaterThan(1);

		expect(types[0]).toBe('response.created');
		expect(types.at(-1)).toBe('response.completed');
		expect(types).toEqual([
			'response.created',
			'response.in_progress',
			'response.output_item.added',
			'response.content_part.added',
			...deltas.map(() => 'response.output_text.delta'),
			'response.output_text.done',
			'response.content_part.done',
			'response.output_item.done',
			'response.completed',
		]);
		expect(sequence).toEqual(sequence.map((_, index) => index));
	});

	test('the stream is sent as text/event-stream with no [DONE]', async () => {
		await start();

		const reply = await fetch(`${server!.url}/v1/responses`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				model: 'gpt-4o',
				input: 'hi',
				stream: true,
			}),
		});
		expect(reply.headers.get('content-type')).toContain(
			'text/event-stream',
		);
		const text = await reply.text();
		expect(text).toContain('event: response.created\ndata: {');
		expect(text).not.toContain('[DONE]');
	});

	test('max_tokens makes the response incomplete, streamed or not', async () => {
		const client = await start();

		const response = await client.responses.create({
			model: 'gpt-4o',
			input: 'WANT_CUT',
		});
		expect(response.status).toBe('incomplete');
		expect(response.incomplete_details).toEqual({
			reason: 'max_output_tokens',
		});
		expect(response.output[0]).toMatchObject({ status: 'incomplete' });
		expect(response.output_text).toBe('This reply stops part of the way');

		const stream = client.responses.stream({
			model: 'gpt-4o',
			input: 'WANT_CUT',
		});
		const types: string[] = [];
		for await (const event of stream) types.push(event.type);
		expect(types.at(-1)).toBe('response.incomplete');
	});

	test('a refusal is a refusal part, streamed as refusal events', async () => {
		const client = await start();

		const response = await client.responses.create({
			model: 'gpt-4o',
			input: 'WANT_REFUSAL',
		});
		expect(response.output[0]).toMatchObject({
			content: [{ type: 'refusal', refusal: 'I can not help.' }],
		});
		expect(response.output_text).toBe('');

		const stream = client.responses.stream({
			model: 'gpt-4o',
			input: 'WANT_REFUSAL',
		});
		const refusal: string[] = [];
		for await (const event of stream) {
			if (event.type === 'response.refusal.delta')
				refusal.push(event.delta);
		}
		expect(refusal.join('')).toBe('I can not help.');
		expect((await stream.finalResponse()).output[0]).toMatchObject({
			content: [{ type: 'refusal', refusal: 'I can not help.' }],
		});
	});

	test('chaos fails a call with the OpenAI error body', async () => {
		const client = await start({ chaos: true, chaosStatus: 429 });

		const error = await client.responses
			.create({ model: 'gpt-4o', input: 'hi' })
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(OpenAI.RateLimitError);
		expect((error as InstanceType<typeof OpenAI.APIError>).status).toBe(
			429,
		);
		expect(server!.lastRequest()).toMatchObject({
			path: '/v1/responses',
			failed: { by: 'chaos', status: 429 },
		});
	});

	test('a stream-error rule sends some deltas, then the error event', async () => {
		const client = await start();

		const stream = await client.responses.create({
			model: 'gpt-4o',
			input: 'WANT_STREAM_ERROR',
			stream: true,
		});
		const deltas: string[] = [];
		const error = await (async () => {
			for await (const event of stream) {
				if (event.type === 'response.output_text.delta') {
					deltas.push(event.delta);
				}
			}
		})().catch((caught: unknown) => caught);

		expect(deltas).toHaveLength(1);
		expect(String(error)).toMatch(/simulated 529 error/);

		// On the wire: the error event carries the next sequence number
		const raw = await (
			await fetch(`${server!.url}/v1/responses`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					model: 'gpt-4o',
					input: 'WANT_STREAM_ERROR',
					stream: true,
				}),
			})
		).text();
		const events = raw.trim().split('\n\n');
		const last = events.at(-1)!;
		expect(last.startsWith('event: error\n')).toBe(true);
		const payload = JSON.parse(last.split('data: ')[1]) as {
			sequence_number: number;
			code: string;
		};
		expect(payload.sequence_number).toBe(events.length - 1);
		expect(payload.code).toBe('server_error');
		expect(raw).not.toContain('response.completed');
	});

	test('a request with no input fails validation with a 400', async () => {
		await start();

		const reply = await fetch(`${server!.url}/v1/responses`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'gpt-4o' }),
		});
		expect(reply.status).toBe(400);
		expect(await reply.text()).toMatch(/Responses API/);
		expect(server!.lastRequest()).toMatchObject({
			path: '/v1/responses',
			valid: false,
		});
	});

	test('GET is a quick smoke test, and the dashboard links to it', async () => {
		await start();

		const reply = await fetch(`${server!.url}/v1/responses`);
		expect(reply.ok).toBe(true);
		expect(((await reply.json()) as { object: string }).object).toBe(
			'response',
		);

		const meta = (await (await fetch(`${server!.url}/ui-meta`)).json()) as {
			apiLinks: Array<{ href: string }>;
		};
		expect(meta.apiLinks.map((link) => link.href)).toContain(
			'/v1/responses',
		);
	});

	test('the chat route still answers beside it', async () => {
		const client = await start();

		const completion = await client.chat.completions.create({
			model: 'gpt-4o',
			messages: [{ role: 'user', content: 'WANT_TEXT' }],
		});
		expect(completion.choices[0].message.content).toBe(
			'The answer is forty two, as ever.',
		);
	});

	test('also served under the chat prefix, so one base URL does both', async () => {
		server = await startServer({
			config,
			port: 0,
			settings: { endpoint: 'chatgpt/chat/completions' },
		});
		const client = new OpenAI({
			apiKey: 'mock',
			baseURL: `${server.url}/chatgpt`,
			maxRetries: 0,
		});

		const response = await client.responses.create({
			model: 'gpt-4o',
			input: 'WANT_TEXT',
		});
		expect(response.output_text).toBe('The answer is forty two, as ever.');
		expect(server.lastRequest()?.path).toBe('/chatgpt/responses');
		expect((await fetch(`${server.url}/v1/responses`)).ok).toBe(true);

		const meta = (await (await fetch(`${server.url}/ui-meta`)).json()) as {
			apiLinks: Array<{ href: string }>;
		};
		expect(meta.apiLinks.map((link) => link.href)).toEqual(
			expect.arrayContaining(['/v1/responses', '/chatgpt/responses']),
		);
	});

	test('a claude preset does not serve it', async () => {
		server = await startServer({ config, model: 'claude', port: 0 });

		const reply = await fetch(`${server.url}/v1/responses`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'gpt-4o', input: 'hi' }),
		});
		expect(reply.status).toBe(404);

		const meta = (await (await fetch(`${server.url}/ui-meta`)).json()) as {
			apiLinks: Array<{ href: string }>;
		};
		expect(meta.apiLinks.map((link) => link.href)).not.toContain(
			'/v1/responses',
		);
	});
});
