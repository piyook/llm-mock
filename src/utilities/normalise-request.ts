import { collectStrings } from './response-rules.js';

/**
 * One provider-neutral view of a chat request, so matching doesn't need to
 * know whether the body is OpenAI, Claude or Gemini shaped.
 */
export interface NormalisedRequest {
	/** The body's `model`. Undefined when absent (Gemini names it in the URL). */
	model: string | undefined;
	/** System prompt text, joined with newlines. Empty when there is none. */
	systemText: string;
	/** Text of the most recent user message that has any text. */
	lastUserText: string;
	/** Assistant turns already in the conversation: 0 for the first call. */
	turnIndex: number;
	/** True when a tool result was sent since the last assistant turn. */
	hasToolResult: boolean;
	/** Every string value in the body, joined with newlines. */
	allText: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Plain text of a message's content, whichever shape it takes: a string, an
 * array of blocks/parts carrying `text` (OpenAI parts, Claude blocks, Gemini
 * parts), or a Gemini `{ parts: [...] }` object. Non-text blocks (images,
 * tool calls, tool results) contribute nothing.
 */
const textOf = (content: unknown): string => {
	if (typeof content === 'string') return content;

	if (Array.isArray(content)) {
		return content
			.map((part) => (isRecord(part) ? part.text : part))
			.filter((text): text is string => typeof text === 'string')
			.join('\n');
	}

	if (isRecord(content)) {
		return Array.isArray(content.parts)
			? textOf(content.parts)
			: textOf([content]);
	}

	return '';
};

// Claude sends tool results as `tool_result` blocks in a user message, Gemini
// as `functionResponse` parts; OpenAI uses a message with the `tool` role.
const isToolResultPart = (part: unknown): boolean =>
	isRecord(part) &&
	(part.type === 'tool_result' ||
		'functionResponse' in part ||
		'function_response' in part);

interface Turn {
	role: unknown;
	text: string;
	toolResult: boolean;
}

const toTurn = (message: unknown): Turn => {
	const { role, content, parts } = isRecord(message)
		? message
		: ({} as Record<string, unknown>);
	const body = content ?? parts;

	return {
		role,
		text: textOf(body),
		toolResult:
			role === 'tool' ||
			role === 'function' ||
			(Array.isArray(body) && body.some(isToolResultPart)),
	};
};

const isAssistant = (turn: Turn) =>
	turn.role === 'assistant' || turn.role === 'model';

const isSystem = (turn: Turn) =>
	turn.role === 'system' || turn.role === 'developer';

// Gemini allows `role` to be left off a user turn.
const isUser = (turn: Turn) => turn.role === 'user' || turn.role === undefined;

/**
 * Normalises an OpenAI, Claude or Gemini request body. The provider is read
 * from the body's shape rather than the active preset, so custom templates
 * that follow one of those shapes work too. Anything unrecognised (including
 * the undefined body of a GET request) yields empty fields.
 */
export const normaliseRequest = (body: unknown): NormalisedRequest => {
	const request = isRecord(body) ? body : {};

	// Gemini puts the conversation in `contents`, the others in `messages`
	const messages = Array.isArray(request.contents)
		? request.contents
		: request.messages;
	const turns = Array.isArray(messages) ? messages.map(toTurn) : [];

	const systemText = [
		textOf(request.system), // Claude
		textOf(request.systemInstruction ?? request.system_instruction), // Gemini
		...turns.filter(isSystem).map((turn) => turn.text), // OpenAI
	]
		.filter(Boolean)
		.join('\n');

	const lastAssistant = turns.findLastIndex(isAssistant);

	return {
		model:
			typeof request.model === 'string' && request.model
				? request.model
				: undefined,
		systemText,
		lastUserText:
			turns.findLast((turn) => isUser(turn) && turn.text !== '')?.text ??
			'',
		turnIndex: turns.filter(isAssistant).length,
		hasToolResult: turns
			.slice(lastAssistant + 1)
			.some((turn) => turn.toolResult),
		allText: collectStrings(body).join('\n'),
	};
};
