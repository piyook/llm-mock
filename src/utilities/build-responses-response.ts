/* eslint-disable @typescript-eslint/naming-convention */
import { faker } from '@faker-js/faker';
import { estimateTokens } from './build-claude-response.js';
import { resolveOpenAiModel } from './build-openai-response.js';
import { streamClaudeEvents } from './build-claude-streaming-response.js';
import { failStream, streamedCount, type StreamFailure } from './chaos.js';
import type { StopReason } from './stop-reason.js';
import type { MockReply } from '../types.js';

/**
 * The OpenAI Responses API (`POST /v1/responses`): what `client.responses
 * .create()` in the OpenAI SDKs calls. Served beside the chat route by
 * presets with the `openai` template. A reply is one `message` output item
 * holding one `output_text` part (or a `refusal` part for a rule with
 * `stopReason: "refusal"`).
 */
export const responsesPath = 'v1/responses';

/**
 * The routes the Responses API is served at, without a leading slash:
 * `v1/responses`, and `<prefix>/responses` for a chat endpoint
 * `<prefix>/chat/completions`, so an SDK given the same base URL for chat
 * finds it (e.g. `chatgpt/responses` beside `chatgpt/chat/completions`).
 * None unless the preset has the `openai` template, and never the chat
 * endpoint itself.
 */
export const responsesPaths = (): string[] => {
	if ((process.env?.LLM_NAME ?? 'openai') !== 'openai') return [];

	const endpoint = (process.env?.LLM_URL_ENDPOINT ?? '').replace(/^\/+/, '');
	const prefix = /^(.*\/)?chat\/completions$/.exec(endpoint)?.[1];
	const paths = new Set([responsesPath]);
	if (prefix !== undefined) paths.add(`${prefix}responses`);
	paths.delete(endpoint);

	return [...paths];
};

type Body = Record<string, unknown>;

const asBody = (body: unknown): Body =>
	typeof body === 'object' && body !== null ? (body as Body) : {};

const hex = (length: number) =>
	faker.string.hexadecimal({ length, casing: 'lower', prefix: '' });

export const newResponseId = (): string => `resp_${hex(48)}`;
const newMessageId = (): string => `msg_${hex(48)}`;

// What the request sent, else the API's default
const echo = (body: Body, key: string, fallback: unknown) =>
	body[key] === undefined ? fallback : body[key];

// Input tokens: the instructions and the input, at about 4 characters each
export const estimateResponsesInputTokens = (body: unknown): number => {
	const { instructions, input } = asBody(body);
	return estimateTokens([instructions ?? '', input ?? '']);
};

const usage = (body: unknown, text: string) => {
	const input = estimateResponsesInputTokens(body);
	const output = estimateTokens(text);

	return {
		input_tokens: input,
		input_tokens_details: { cached_tokens: 0 },
		output_tokens: output,
		output_tokens_details: { reasoning_tokens: 0 },
		total_tokens: input + output,
	};
};

// The content part a reply's text goes in
const contentPart = (text: string, stopReason: StopReason | undefined) =>
	stopReason === 'refusal'
		? { type: 'refusal', refusal: text }
		: { type: 'output_text', text, annotations: [] };

/**
 * The response object: complete when `output` is given, or as the opening
 * events of a stream send it (in progress, no output, no usage yet)
 */
const responseObject = (
	ids: { response: string; created: number },
	body: unknown,
	end?: {
		output: unknown[];
		text: string;
		stopReason: StopReason | undefined;
	},
) => {
	const request = asBody(body);
	const incomplete = end?.stopReason === 'max_tokens';

	return {
		id: ids.response,
		object: 'response',
		created_at: ids.created,
		status: end ? (incomplete ? 'incomplete' : 'completed') : 'in_progress',
		background: false,
		error: null,
		incomplete_details: incomplete ? { reason: 'max_output_tokens' } : null,
		instructions: echo(request, 'instructions', null),
		max_output_tokens: echo(request, 'max_output_tokens', null),
		model: resolveOpenAiModel(body),
		output: end?.output ?? [],
		parallel_tool_calls: echo(request, 'parallel_tool_calls', true),
		previous_response_id: echo(request, 'previous_response_id', null),
		reasoning: { effort: null, summary: null },
		store: echo(request, 'store', true),
		temperature: echo(request, 'temperature', 1),
		text: echo(request, 'text', { format: { type: 'text' } }),
		tool_choice: echo(request, 'tool_choice', 'auto'),
		tools: echo(request, 'tools', []),
		top_p: echo(request, 'top_p', 1),
		truncation: echo(request, 'truncation', 'disabled'),
		usage: end ? usage(body, end.text) : null,
		user: echo(request, 'user', null),
		metadata: echo(request, 'metadata', {}),
	};
};

const messageItem = (
	id: string,
	status: string,
	content: unknown[],
): Record<string, unknown> => ({
	id,
	type: 'message',
	status,
	role: 'assistant',
	content,
});

const newIds = () => ({
	response: newResponseId(),
	message: newMessageId(),
	created: Math.floor(Date.now() / 1000),
});

/**
 * The non-streamed reply: a response with one assistant message. A rule's
 * `max_tokens` stop reason makes it `incomplete` with reason
 * `max_output_tokens`; `refusal` puts the text in a refusal part.
 */
export const buildResponsesResponse = (mockReply: MockReply, body: unknown) => {
	const { text, stopReason } = mockReply;
	const ids = newIds();
	const itemStatus = stopReason === 'max_tokens' ? 'incomplete' : 'completed';

	return responseObject(ids, body, {
		output: [
			messageItem(ids.message, itemStatus, [
				contentPart(text, stopReason),
			]),
		],
		text,
		stopReason,
	});
};

// Split after each run of whitespace so the pieces join back to the text
const splitIntoDeltas = (text: string): string[] => {
	if (!text) return [];

	const pieces = text.split(/(?<=\s)(?=\S)/);
	const size = Math.max(1, Math.floor(pieces.length / 5)); // ~5 deltas
	const deltas: string[] = [];
	for (let i = 0; i < pieces.length; i += size) {
		deltas.push(pieces.slice(i, i + size).join(''));
	}

	return deltas;
};

export interface ResponsesEvents {
	/** Each entry is `event: <type>\ndata: <json>`, without the blank line */
	events: string[];
	/** Indexes in `events` of the text (or refusal) delta events */
	deltas: number[];
	/** Index of the content_part.added event, where a 0-delta failure stops */
	partAdded: number;
}

/**
 * The streamed reply as the Responses API sends it: response.created,
 * response.in_progress, response.output_item.added,
 * response.content_part.added, a response.output_text.delta per piece,
 * response.output_text.done, response.content_part.done,
 * response.output_item.done, then response.completed (response.incomplete for
 * `max_tokens`) holding the whole response. A refusal streams
 * response.refusal.delta / response.refusal.done instead. Every event has a
 * `sequence_number`, counting from 0. There is no `[DONE]`.
 */
export const buildResponsesEvents = (
	mockReply: MockReply,
	body: unknown,
): ResponsesEvents => {
	const { text, stopReason } = mockReply;
	const ids = newIds();
	const refusal = stopReason === 'refusal';
	const events: string[] = [];
	const deltas: number[] = [];

	const push = (type: string, payload: Record<string, unknown>) => {
		events.push(
			`event: ${type}\ndata: ${JSON.stringify({
				type,
				sequence_number: events.length,
				...payload,
			})}`,
		);
	};

	const at = { item_id: ids.message, output_index: 0, content_index: 0 };
	const itemStatus = stopReason === 'max_tokens' ? 'incomplete' : 'completed';
	const part = contentPart(text, stopReason);
	const item = messageItem(ids.message, itemStatus, [part]);

	push('response.created', { response: responseObject(ids, body) });
	push('response.in_progress', { response: responseObject(ids, body) });
	push('response.output_item.added', {
		output_index: 0,
		item: messageItem(ids.message, 'in_progress', []),
	});
	push('response.content_part.added', {
		...at,
		part: refusal
			? { type: 'refusal', refusal: '' }
			: { type: 'output_text', text: '', annotations: [] },
	});
	const partAdded = events.length - 1;

	for (const delta of splitIntoDeltas(text)) {
		deltas.push(events.length);
		push(
			refusal ? 'response.refusal.delta' : 'response.output_text.delta',
			refusal ? { ...at, delta } : { ...at, delta, logprobs: [] },
		);
	}

	push(
		refusal ? 'response.refusal.done' : 'response.output_text.done',
		refusal ? { ...at, refusal: text } : { ...at, text, logprobs: [] },
	);
	push('response.content_part.done', { ...at, part });
	push('response.output_item.done', { output_index: 0, item });
	push(
		stopReason === 'max_tokens'
			? 'response.incomplete'
			: 'response.completed',
		{
			response: responseObject(ids, body, {
				output: [item],
				text,
				stopReason,
			}),
		},
	);

	return { events, deltas, partAdded };
};

/**
 * Sends the streamed reply. With a chaos `failure` it sends the opening
 * events and `afterChunks` deltas, then fails (see chaos.ts); a stream-error
 * ends with the API's `error` event.
 */
export const handleResponsesStreamingResponse = async (
	mockReply: MockReply,
	reply: any,
	body: unknown,
	failure?: StreamFailure,
): Promise<void> => {
	try {
		const { events, deltas, partAdded } = buildResponsesEvents(
			mockReply,
			body,
		);

		reply.hijack();
		reply.raw.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'Access-Control-Allow-Origin': '*',
		});

		if (failure) {
			const sent = streamedCount(deltas.length, failure);
			const end = sent === 0 ? partAdded : deltas[sent - 1];
			await streamClaudeEvents(events.slice(0, end + 1), reply, false);
			failStream(reply, failure, 'responses', end + 1);
			return;
		}

		await streamClaudeEvents(events, reply);
	} catch (error) {
		console.error('Responses streaming error:', error);
		if (!reply.raw.destroyed) reply.raw.end();
	}
};
