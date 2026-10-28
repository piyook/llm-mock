/* eslint-disable @typescript-eslint/naming-convention */
import { faker } from '@faker-js/faker';

/**
 * Tool-call replies for the claude format. A response rule can answer with
 * content blocks in place of text, standing for a model that asks the client
 * to run tools:
 *
 *   { "match": "Weather in Paris?", "content": [
 *       { "type": "text", "text": "Let me check." },
 *       { "type": "tool_use", "name": "get_weather", "input": { "city": "Paris" } } ] }
 *
 * At most one text block, and only first; then one or more tool_use blocks,
 * sent in the order given. A tool_use without an `id` gets a new one on every
 * reply. The reply ends with stop_reason "tool_use".
 */

export type RuleTextBlock = { type: 'text'; text: string };

export type RuleToolUseBlock = {
	type: 'tool_use';
	id?: string;
	name: string;
	input?: Record<string, unknown>;
};

export type RuleContentBlock = RuleTextBlock | RuleToolUseBlock;

// A block as it goes out: every tool_use has its id and input
export type ReplyToolUseBlock = {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
};

export type ReplyContentBlock = RuleTextBlock | ReplyToolUseBlock;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a rule's content array. `label` names it in the error, e.g.
 * `responseRules[2].content`.
 */
export const validateRuleContent = (content: unknown, label: string): void => {
	if (!Array.isArray(content) || content.length === 0) {
		throw new TypeError(`${label} must be a non-empty array of blocks`);
	}

	const ids = new Set<string>();
	for (const [index, block] of content.entries()) {
		const where = `${label}[${index}]`;
		if (!isPlainObject(block)) {
			throw new TypeError(`${where} must be an object`);
		}

		if (block.type === 'text') {
			if (index !== 0) {
				throw new TypeError(
					`${where}: a text block can only be the first block`,
				);
			}

			// The API rejects an empty text block sent back to it
			if (typeof block.text !== 'string' || block.text === '') {
				throw new TypeError(`${where}.text must be a non-empty string`);
			}

			const unknown = Object.keys(block).filter(
				(key) => key !== 'type' && key !== 'text',
			);
			if (unknown.length > 0) {
				throw new TypeError(
					`${where} has unknown settings: ${unknown.join(', ')}`,
				);
			}

			continue;
		}

		if (block.type !== 'tool_use') {
			throw new TypeError(`${where}.type must be "text" or "tool_use"`);
		}

		if (typeof block.name !== 'string' || block.name === '') {
			throw new TypeError(`${where}.name must be a non-empty string`);
		}

		if (block.input !== undefined && !isPlainObject(block.input)) {
			throw new TypeError(`${where}.input must be a JSON object`);
		}

		if (
			block.id !== undefined &&
			(typeof block.id !== 'string' || block.id === '')
		) {
			throw new TypeError(`${where}.id must be a non-empty string`);
		}

		// Each tool_result names its call by id, so ids must not repeat
		if (typeof block.id === 'string') {
			if (ids.has(block.id)) {
				throw new TypeError(`${where}.id "${block.id}" is used twice`);
			}

			ids.add(block.id);
		}

		const unknown = Object.keys(block).filter(
			(key) => !['type', 'id', 'name', 'input'].includes(key),
		);
		if (unknown.length > 0) {
			throw new TypeError(
				`${where} has unknown settings: ${unknown.join(', ')}`,
			);
		}
	}

	if (!content.some((block) => block.type === 'tool_use')) {
		throw new TypeError(`${label} must have at least one tool_use block`);
	}
};

// An id in the API's style: toolu_01 and 22 letters and digits
export const newToolUseId = (): string =>
	`toolu_01${faker.string.alphanumeric(22)}`;

/**
 * The blocks one reply sends: a copy of the rule's, with a new id for each
 * tool_use that has none and `{}` for a missing input.
 */
export const toReplyBlocks = (
	content: RuleContentBlock[],
): ReplyContentBlock[] =>
	content.map((block) =>
		block.type === 'text'
			? { type: 'text', text: block.text }
			: {
					type: 'tool_use',
					id: block.id ?? newToolUseId(),
					name: block.name,
					input: structuredClone(block.input ?? {}),
				},
	);

/**
 * Splits a tool's input, as JSON, into a few pieces that join back to it, for
 * the input_json_delta events of a stream. Always at least one piece, so
 * `{}` is sent as one delta.
 */
export const splitInputJson = (json: string, pieces: number = 3): string[] => {
	// A short input is not worth splitting
	const count = Math.max(1, Math.min(pieces, Math.ceil(json.length / 8)));
	const size = Math.ceil(json.length / count);
	const chunks: string[] = [];
	let start = 0;
	while (start < json.length) {
		let end = Math.min(start + size, json.length);
		// Never cut between the two halves of a surrogate pair (an emoji)
		const code = json.charCodeAt(end - 1);
		if (end < json.length && code >= 0xd8_00 && code <= 0xdb_ff) end += 1;
		chunks.push(json.slice(start, end));
		start = end;
	}

	return chunks.length > 0 ? chunks : [''];
};
