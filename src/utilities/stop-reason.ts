/* eslint-disable @typescript-eslint/naming-convention */

/**
 * How a reply ends. A response rule sets it with `stopReason`, so a fixture
 * can stand for a truncated or refused reply:
 *
 *   { "match": "Summarise this", "file": "fixtures/cut-off.txt", "stopReason": "max_tokens" }
 *
 * `end` is a reply that finished normally, which is what every reply without
 * a `stopReason` is.
 */
export const stopReasons = ['end', 'max_tokens', 'refusal'] as const;

export type StopReason = (typeof stopReasons)[number];

export const isStopReason = (value: unknown): value is StopReason =>
	stopReasons.includes(value as StopReason);

// The value each wire format uses. Custom template names use the openai one.
const wireStopReasons: Record<string, Record<StopReason, string>> = {
	claude: { end: 'end_turn', max_tokens: 'max_tokens', refusal: 'refusal' },
	openai: { end: 'stop', max_tokens: 'length', refusal: 'content_filter' },
	gemini: { end: 'STOP', max_tokens: 'MAX_TOKENS', refusal: 'SAFETY' },
};

export const toWireStopReason = (
	llmName: string | undefined,
	stopReason: StopReason,
): string =>
	(wireStopReasons[llmName ?? ''] ?? wireStopReasons.openai)[stopReason];

/**
 * `stop_details` of a refused Anthropic message. The API sends a null
 * `category` and `explanation` for a refusal that maps to no named policy
 * area, which is what a mocked refusal is.
 */
export const claudeRefusalStopDetails = {
	type: 'refusal',
	category: null,
	explanation: null,
} as const;

/**
 * Writes a rule's stop reason into a non-streamed response. A reply that ends
 * normally (`end`, or no stop reason) is returned untouched, so the response
 * template decides what it says.
 */
export const applyStopReason = <T>(
	response: T,
	llmName: string | undefined,
	stopReason: StopReason | undefined,
): T => {
	if (!stopReason || stopReason === 'end') return response;
	if (typeof response !== 'object' || response === null) return response;

	const value = toWireStopReason(llmName, stopReason);
	const body = response as Record<string, unknown>;

	if (llmName === 'claude') {
		return {
			...body,
			stop_reason: value,
			...(stopReason === 'refusal' && {
				stop_details: claudeRefusalStopDetails,
			}),
		} as T;
	}

	// A custom template with no such list has nowhere to carry it
	const [list, key] =
		llmName === 'gemini'
			? ['candidates', 'finishReason']
			: ['choices', 'finish_reason'];
	if (!Array.isArray(body[list])) return response;

	return {
		...body,
		[list]: body[list].map((entry: unknown) =>
			typeof entry === 'object' && entry !== null
				? { ...entry, [key]: value }
				: entry,
		),
	} as T;
};
