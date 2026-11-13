import {
	estimateInputTokens,
	estimateTokens,
} from './build-claude-response.js';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export type OpenAiUsage = {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
};

/**
 * Whether replies are in the OpenAI chat-completions format, so carry the
 * per-request fields below. Other presets that reuse the OpenAI-style stream
 * (gemini, custom ones) keep their template's values.
 */
export const isOpenAiFormat = (): boolean =>
	(process.env.LLM_NAME ?? 'openai') === 'openai';

/**
 * Model name to echo back: the request's `model`, else the preset's model.
 */
export const resolveOpenAiModel = (body: unknown): string => {
	const requested =
		typeof body === 'object' && body !== null
			? (body as { model?: unknown }).model
			: undefined;

	return typeof requested === 'string' && requested
		? requested
		: process.env.LLM_MODEL || DEFAULT_OPENAI_MODEL;
};

/**
 * Estimated token usage of a reply (the mock never tokenizes): the request's
 * messages in, the reply text out.
 */
export const estimateOpenAiUsage = (
	body: unknown,
	completion: string,
): OpenAiUsage => {
	const prompt = estimateInputTokens(body);
	const completionTokens = estimateTokens(completion);

	return {
		prompt_tokens: prompt,
		completion_tokens: completionTokens,
		total_tokens: prompt + completionTokens,
	};
};

/**
 * Whether a streamed reply ends with a usage chunk, as the OpenAI API does when
 * the request sends `stream_options: {include_usage: true}`.
 */
export const wantsStreamUsage = (body: unknown): boolean =>
	typeof body === 'object' &&
	body !== null &&
	(body as { stream_options?: { include_usage?: unknown } }).stream_options
		?.include_usage === true;

/**
 * Fills in the per-request fields of an OpenAI-format reply built from the
 * template: the echoed model and estimated usage. A project template with no
 * `usage` gets none added.
 */
export const applyOpenAiRequestFields = <T extends Record<string, unknown>>(
	response: T,
	body: unknown,
	completion: string,
): T => {
	const filled: Record<string, unknown> = {
		...response,
		model: resolveOpenAiModel(body),
	};
	if (typeof response.usage === 'object' && response.usage !== null) {
		filled.usage = estimateOpenAiUsage(body, completion);
	}

	return filled as T;
};
