import { delay, getDelayConfig } from './delay.js';
import {
	DEFAULT_CLAUDE_MODEL,
	estimateInputTokens,
	estimateTokens,
	newClaudeMessageId,
	resolveClaudeModel,
} from './build-claude-response.js';
import {
	claudeRefusalStopDetails,
	toWireStopReason,
	type StopReason,
} from './stop-reason.js';
import { failStream, streamedCount, type StreamFailure } from './chaos.js';
import {
	splitInputJson,
	type ReplyContentBlock,
	type ReplyToolUseBlock,
} from './tool-use.js';
import type { MockReply } from '../types.js';

// Split after each run of whitespace so the pieces join back to `content`
// exactly (newlines included, which matters for JSON bodies).
const splitIntoPieces = (content: string): string[] => {
	if (!content) return [];

	const pieces = content.split(/(?<=\s)(?=\S)/);
	const size = Math.max(1, Math.floor(pieces.length / 5)); // ~5 deltas
	const grouped: string[] = [];
	for (let i = 0; i < pieces.length; i += size) {
		grouped.push(pieces.slice(i, i + size).join(''));
	}

	return grouped;
};

const toEvent = (type: string, payload: Record<string, unknown>) =>
	`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}`;

// The opening event: the message with no content yet
const messageStart = (model: string, inputTokens: number) =>
	toEvent('message_start', {
		message: {
			id: newClaudeMessageId(),
			type: 'message',
			role: 'assistant',
			model,
			content: [],
			stop_reason: null,
			stop_sequence: null,
			usage: {
				input_tokens: inputTokens,
				output_tokens: 1,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			},
		},
	});

// A text block at `index`: its start, a text_delta per piece, its stop
const textBlockEvents = (text: string, index: number) => [
	toEvent('content_block_start', {
		index,
		content_block: { type: 'text', text: '' },
	}),
	...splitIntoPieces(text).map((piece) =>
		toEvent('content_block_delta', {
			index,
			delta: { type: 'text_delta', text: piece },
		}),
	),
	toEvent('content_block_stop', { index }),
];

// A tool_use block at `index`: its start with an empty input, the input as
// input_json_delta pieces, its stop
const toolUseBlockEvents = (block: ReplyToolUseBlock, index: number) => [
	toEvent('content_block_start', {
		index,
		content_block: {
			type: 'tool_use',
			id: block.id,
			name: block.name,
			input: {},
		},
	}),
	...splitInputJson(JSON.stringify(block.input)).map((partial_json) =>
		toEvent('content_block_delta', {
			index,
			delta: { type: 'input_json_delta', partial_json },
		}),
	),
	toEvent('content_block_stop', { index }),
];

// The closing events: the stop reason and output tokens, then message_stop
const closingEvents = (
	delta: Record<string, unknown>,
	outputTokens: number,
) => [
	toEvent('message_delta', {
		delta,
		usage: { output_tokens: outputTokens },
	}),
	toEvent('message_stop', {}),
];

/**
 * Builds the Anthropic Messages streaming events for `content`.
 *
 * Order: message_start, content_block_start, content_block_delta (repeated),
 * content_block_stop, message_delta (carries stop_reason), message_stop.
 * Each entry is `event: <type>\ndata: <json>` without the trailing blank line.
 * With empty content the block has no deltas.
 *
 * @param content - Full text to stream
 * @param model - Model name to echo in message_start
 * @param inputTokens - Reported input_tokens
 * @param stopReason - How the reply ends; a refusal also carries stop_details
 */
export const generateClaudeStreamingChunks = (
	content: string,
	model: string = DEFAULT_CLAUDE_MODEL,
	inputTokens: number = 1,
	stopReason: StopReason = 'end',
): string[] => [
	messageStart(model, inputTokens),
	...textBlockEvents(content, 0),
	...closingEvents(
		{
			stop_reason: toWireStopReason('claude', stopReason),
			stop_sequence: null,
			...(stopReason === 'refusal' && {
				stop_details: claudeRefusalStopDetails,
			}),
		},
		estimateTokens(content),
	),
];

/**
 * Builds the streaming events of a tool-call reply: each block in turn at its
 * own index (a leading text block streams as text_delta events, each tool_use
 * as input_json_delta events), then message_delta with stop_reason
 * "tool_use".
 */
export const generateClaudeToolStreamingChunks = (
	blocks: ReplyContentBlock[],
	model: string = DEFAULT_CLAUDE_MODEL,
	inputTokens: number = 1,
): string[] => [
	messageStart(model, inputTokens),
	...blocks.flatMap((block, index) =>
		block.type === 'text'
			? textBlockEvents(block.text, index)
			: toolUseBlockEvents(block, index),
	),
	...closingEvents(
		{ stop_reason: 'tool_use', stop_sequence: null },
		estimateTokens(blocks),
	),
];

/**
 * The events a stream that fails part-way through sends: everything up to
 * and including its `afterChunks`th content_block_delta, of any block (or its
 * last delta if it has fewer). With 0, or no deltas at all, it stops after
 * the first content_block_start. The closing events are never reached.
 */
export const eventsBeforeFailure = (
	events: string[],
	failure: StreamFailure,
): string[] => {
	const isEvent = (type: string) => (event: string) =>
		event.startsWith(`event: ${type}\n`);
	const deltas = events.flatMap((event, index) =>
		isEvent('content_block_delta')(event) ? [index] : [],
	);
	const sent = streamedCount(deltas.length, failure);
	const end =
		sent === 0
			? events.findIndex(isEvent('content_block_start'))
			: deltas[sent - 1];

	return events.slice(0, end + 1);
};

/**
 * Writes SSE events with the configured delay spread across them, then ends
 * the response unless `end` is false. Stops early if the client disconnects
 * (e.g. the SDK aborts).
 */
export const streamClaudeEvents = async (
	events: string[],
	reply: any,
	end: boolean = true,
): Promise<void> => {
	const delayConfig = getDelayConfig();
	const perEventDelay = delayConfig.enabled
		? Math.max(50, (delayConfig.min + delayConfig.max) / 2 / events.length)
		: 50;

	for (const [index, event] of events.entries()) {
		if (reply.raw.destroyed) return;

		reply.raw.write(`${event}\n\n`);
		// A stream left open has more to come, so it waits after its last
		// event too
		if (index < events.length - 1 || !end) {
			await delay(perEventDelay, perEventDelay);
		}
	}

	if (end) reply.raw.end();
};

/**
 * Sends a Claude-style SSE stream for the reply's text, or its blocks for a
 * tool-call reply. Headers are written
 * on the raw response because the events are written to it directly. With a
 * chaos `failure` the stream is cut part-way through (see chaos.ts).
 */
export const handleClaudeStreamingResponse = async (
	mockReply: MockReply,
	reply: any,
	body?: unknown,
	failure?: StreamFailure,
): Promise<void> => {
	try {
		const events = mockReply.content
			? generateClaudeToolStreamingChunks(
					mockReply.content,
					resolveClaudeModel(body),
					estimateInputTokens(body),
				)
			: generateClaudeStreamingChunks(
					mockReply.text,
					resolveClaudeModel(body),
					estimateInputTokens(body),
					mockReply.stopReason,
				);

		reply.hijack();
		reply.raw.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'Access-Control-Allow-Origin': '*',
		});

		if (failure) {
			// The opening events and some deltas, then the failure in place
			// of the closing events
			await streamClaudeEvents(
				eventsBeforeFailure(events, failure),
				reply,
				false,
			);
			failStream(reply, failure, 'claude');
			return;
		}

		await streamClaudeEvents(events, reply);
	} catch (error) {
		console.error('Claude streaming error:', error);
		if (!reply.raw.destroyed) {
			reply.raw.end();
		}
	}
};
