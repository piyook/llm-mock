/* eslint-disable  @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	generateClaudeStreamingChunks,
	handleClaudeStreamingResponse,
	streamClaudeEvents,
} from '../../utilities/build-claude-streaming-response.js';
import {
	estimateTokens,
	resolveClaudeModel,
} from '../../utilities/build-claude-response.js';

type ParsedEvent = { event: string; data: any };

const parse = (chunks: string[]): ParsedEvent[] =>
	chunks.map((chunk) => {
		const [eventLine, dataLine, ...rest] = chunk.split('\n');
		expect(eventLine).toMatch(/^event: /);
		expect(dataLine).toMatch(/^data: /);
		expect(rest).toHaveLength(0);
		return {
			event: eventLine.slice('event: '.length),
			data: JSON.parse(dataLine.slice('data: '.length)),
		};
	});

const textOf = (events: ParsedEvent[]) =>
	events
		.filter((e) => e.event === 'content_block_delta')
		.map((e) => e.data.delta.text)
		.join('');

const makeReply = (destroyed = false) => ({
	hijack: vi.fn(),
	raw: {
		write: vi.fn(),
		writeHead: vi.fn(),
		end: vi.fn(),
		destroyed,
	},
});

describe('generateClaudeStreamingChunks', () => {
	test('emits events in the Anthropic order', () => {
		const events = parse(
			generateClaudeStreamingChunks(
				'This is a reply long enough to be split into several deltas for the stream.',
			),
		);
		const names = events.map((e) => e.event);

		expect(names[0]).toBe('message_start');
		expect(names[1]).toBe('content_block_start');
		expect(names.slice(-3)).toEqual([
			'content_block_stop',
			'message_delta',
			'message_stop',
		]);
		const middle = names.slice(2, -3);
		expect(middle.length).toBeGreaterThan(1);
		expect(new Set(middle)).toEqual(new Set(['content_block_delta']));
	});

	test('event name matches the type inside each data payload', () => {
		for (const { event, data } of parse(
			generateClaudeStreamingChunks('hello there world'),
		)) {
			expect(data.type).toBe(event);
		}
	});

	test('message_start carries an empty assistant message', () => {
		const [start] = parse(
			generateClaudeStreamingChunks('hi', 'claude-test', 42),
		);
		const { message } = start.data;

		expect(message.id).toMatch(/^msg_[A-Za-z0-9]{24}$/);
		expect(message).toMatchObject({
			type: 'message',
			role: 'assistant',
			model: 'claude-test',
			content: [],
			stop_reason: null,
			stop_sequence: null,
		});
		expect(message.usage.input_tokens).toBe(42);
	});

	test('content block is a text block at index 0', () => {
		const events = parse(generateClaudeStreamingChunks('a b c d e f g'));

		expect(events[1].data).toEqual({
			type: 'content_block_start',
			index: 0,
			content_block: { type: 'text', text: '' },
		});
		for (const e of events.filter(
			(x) => x.event === 'content_block_delta',
		)) {
			expect(e.data.index).toBe(0);
			expect(e.data.delta.type).toBe('text_delta');
		}
		expect(events.at(-3)?.data).toEqual({
			type: 'content_block_stop',
			index: 0,
		});
	});

	test('message_delta ends the turn and reports output tokens', () => {
		const content = 'some generated words here';
		const delta = parse(generateClaudeStreamingChunks(content)).at(-2)!;

		expect(delta.data.delta).toEqual({
			stop_reason: 'end_turn',
			stop_sequence: null,
		});
		expect(delta.data.usage.output_tokens).toBe(estimateTokens(content));
	});

	test.each([
		['plain words', 'one two three four five six seven eight nine ten'],
		['newlines and indentation', '{\n  "a": 1,\n  "b": [1, 2]\n}\n'],
		['leading and trailing spaces', '  padded reply  '],
		['single word', 'word'],
	])('deltas rejoin to the exact content (%s)', (_name, content) => {
		expect(textOf(parse(generateClaudeStreamingChunks(content)))).toBe(
			content,
		);
	});

	test('empty content has a block but no deltas', () => {
		const names = parse(generateClaudeStreamingChunks('')).map(
			(e) => e.event,
		);

		expect(names).toEqual([
			'message_start',
			'content_block_start',
			'content_block_stop',
			'message_delta',
			'message_stop',
		]);
	});

	test('each stream gets a unique message id', () => {
		const id = () =>
			parse(generateClaudeStreamingChunks('x'))[0].data.message.id;
		expect(id()).not.toBe(id());
	});
});

describe('resolveClaudeModel', () => {
	beforeEach(() => {
		delete process.env.LLM_MODEL;
	});

	test('echoes the requested model', () => {
		expect(resolveClaudeModel({ model: 'claude-x' })).toBe('claude-x');
	});

	test('falls back to the preset model, then a default', () => {
		process.env.LLM_MODEL = 'claude-preset';
		expect(resolveClaudeModel({})).toBe('claude-preset');
		expect(resolveClaudeModel(undefined)).toBe('claude-preset');
		delete process.env.LLM_MODEL;
		expect(resolveClaudeModel(undefined)).toBe('claude-opus-5-5');
	});
});

describe('streamClaudeEvents', () => {
	beforeEach(() => {
		process.env.RESPONSE_DELAY_MIN = '0';
		process.env.RESPONSE_DELAY_MAX = '0';
	});

	test('writes every event followed by a blank line, then ends', async () => {
		const events = generateClaudeStreamingChunks('hello world again');
		const reply = makeReply();

		await streamClaudeEvents(events, reply);

		expect(reply.raw.write).toHaveBeenCalledTimes(events.length);
		for (const [i, event] of events.entries()) {
			expect(reply.raw.write).toHaveBeenNthCalledWith(
				i + 1,
				`${event}\n\n`,
			);
		}
		expect(reply.raw.end).toHaveBeenCalledTimes(1);
	});

	test('stops writing when the client has disconnected', async () => {
		const reply = makeReply(true);

		await streamClaudeEvents(generateClaudeStreamingChunks('hi'), reply);

		expect(reply.raw.write).not.toHaveBeenCalled();
		expect(reply.raw.end).not.toHaveBeenCalled();
	});
});

describe('handleClaudeStreamingResponse', () => {
	beforeEach(() => {
		process.env.RESPONSE_DELAY_MIN = '0';
		process.env.RESPONSE_DELAY_MAX = '0';
	});

	test('sends SSE headers on the raw response and streams the content', async () => {
		const reply = makeReply();

		await handleClaudeStreamingResponse('hello streamed world', reply, {
			model: 'claude-x',
			messages: [{ role: 'user', content: 'hi' }],
		});

		expect(reply.hijack).toHaveBeenCalled();
		expect(reply.raw.writeHead).toHaveBeenCalledWith(
			200,
			expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
		);
		const written: string[] = reply.raw.write.mock.calls.map(
			(c: string[]) => c[0].trimEnd(),
		);
		const events = parse(written);
		expect(events[0].data.message.model).toBe('claude-x');
		expect(textOf(events)).toBe('hello streamed world');
		expect(reply.raw.end).toHaveBeenCalled();
	});

	test('ends the response instead of throwing when writing fails', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const reply = makeReply();
		reply.raw.write.mockImplementation(() => {
			throw new Error('socket closed');
		});

		await expect(
			handleClaudeStreamingResponse('hi', reply),
		).resolves.toBeUndefined();
		expect(reply.raw.end).toHaveBeenCalled();
		spy.mockRestore();
	});
});
