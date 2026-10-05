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
): string[] => {
	const id = newClaudeMessageId();
	const outputTokens = estimateTokens(content);

	return [
		toEvent('message_start', {
			message: {
				id,
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
		}),
		toEvent('content_block_start', {
			index: 0,
			content_block: { type: 'text', text: '' },
		}),
		...splitIntoPieces(content).map((text) =>
			toEvent('content_block_delta', {
				index: 0,
				delta: { type: 'text_delta', text },
			}),
		),
		toEvent('content_block_stop', { index: 0 }),
		toEvent('message_delta', {
			delta: {
				stop_reason: toWireStopReason('claude', stopReason),
				stop_sequence: null,
				...(stopReason === 'refusal' && {
					stop_details: claudeRefusalStopDetails,
				}),
			},
			usage: { output_tokens: outputTokens },
		}),
		toEvent('message_stop', {}),
	];
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
 * Sends a Claude-style SSE stream for the reply's text. Headers are written
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
		const events = generateClaudeStreamingChunks(
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
			// message_start, content_block_start and some deltas, then the
			// failure in place of the three closing events
			const sent = events.slice(
				0,
				2 + streamedCount(events.length - 5, failure),
			);
			await streamClaudeEvents(sent, reply, false);
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
