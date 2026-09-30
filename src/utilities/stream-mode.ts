/**
 * Decides whether a request should get an SSE stream or a single JSON body.
 *
 * Claude clients (the Anthropic SDK) choose per request with `stream: true`,
 * and send it even for calls that only want the final message, so the request
 * wins. The OpenAI/Gemini presets keep the server-wide STREAM setting.
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
	if (llmName === 'claude') {
		return (
			typeof body === 'object' &&
			body !== null &&
			(body as { stream?: unknown }).stream === true
		);
	}

	return streamEnv?.toLowerCase() === 'true';
};
