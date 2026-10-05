import { faker } from '@faker-js/faker';
import { buildResponse } from './build-response.js';
import { applyStopReason } from './stop-reason.js';
import type { MockReply } from '../types.js';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/**
 * Model name to echo back: the request's `model`, else the preset's model.
 */
export const resolveClaudeModel = (body: unknown): string => {
	const requested =
		typeof body === 'object' && body !== null
			? (body as { model?: unknown }).model
			: undefined;

	return typeof requested === 'string' && requested
		? requested
		: (process.env.LLM_MODEL ?? DEFAULT_CLAUDE_MODEL);
};

// Rough estimate (about 4 characters per token) - the mock never tokenizes.
export const estimateTokens = (value: unknown): number => {
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return Math.max(1, Math.ceil((text?.length ?? 0) / 4));
};

export const estimateInputTokens = (body: unknown): number =>
	estimateTokens(
		(body as { messages?: unknown } | undefined)?.messages ?? '',
	);

export const newClaudeMessageId = (): string =>
	`msg_${faker.string.alphanumeric(24)}`;

export type ClaudeMessage = Record<string, unknown> & {
	id: string;
	model: string;
	usage: {
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens: number;
		cache_read_input_tokens: number;
	};
};

/**
 * Builds the non-streaming Messages response from the claude response
 * template (so a project-level template still applies), then fills in the
 * per-request fields: unique id, echoed model and estimated token usage, and
 * the reply's stop reason if it has one.
 */
export const buildClaudeStaticResponse = async (
	mockReply: MockReply,
	body?: unknown,
): Promise<ClaudeMessage> => {
	const content = mockReply.text;
	const template = (await buildResponse(content)) as Record<string, unknown>;

	return applyStopReason(
		{
			...template,
			id: newClaudeMessageId(),
			model: resolveClaudeModel(body),
			usage: {
				input_tokens: estimateInputTokens(body),
				output_tokens: estimateTokens(content),
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			},
		},
		'claude',
		mockReply.stopReason,
	);
};
