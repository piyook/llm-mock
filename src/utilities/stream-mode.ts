/**
 * Decides whether a request should get an SSE stream or a single JSON body.
 *
 * - claude: the request decides. The Anthropic SDK sends `stream: true` for
 *   every streamed call, and a request without it gets JSON, as the real API
 *   does.
 * - openai: the request's `stream: true` / `stream: false` decides, as with
 *   the real chat completions API. A request without a boolean `stream` (or a
 *   GET, which has no body) gets the server-wide STREAM setting.
 * - gemini and anything else: the server-wide STREAM setting. Real Gemini
 *   chooses streaming by URL, not by a body field.
 *
 * @param llmName - Template name from config (LLM_NAME), e.g. 'claude'
 * @param body - Parsed request body (may be undefined for GET routes)
 * @param streamEnv - Server-wide STREAM setting ('true' / 'false')
 */
export const shouldStream = (
	llmName: string | undefined,
	body: unknown,
	streamEnv: string | undefined,
): boolean => {
	const requested =
		typeof body === 'object' && body !== null
			? (body as { stream?: unknown }).stream
			: undefined;

	if (llmName === 'claude') return requested === true;

	if (llmName === 'openai' && typeof requested === 'boolean') {
		return requested;
	}

	return streamEnv?.toLowerCase() === 'true';
};
