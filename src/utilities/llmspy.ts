import {
	llmspyLines,
	llmspyRoute,
	type LlmspyRoute,
} from '../../bin/process-utils.js';

export { llmspyLines, type LlmspyRoute };

/**
 * How to put the running server behind LLMSpy, from the settings in the
 * environment; null when the llmspy setting is off. Read per call: the port
 * is only known once the server listens.
 */
export function currentLlmspyRoute(): LlmspyRoute | null {
	const llmspy = process.env.LLMSPY_URL;
	if (!llmspy) return null;

	return llmspyRoute({
		llmspy,
		modelName: process.env.LLM_MODEL_NAME ?? '',
		llmName: process.env.LLM_NAME ?? '',
		endpoint: process.env.LLM_URL_ENDPOINT ?? '',
		host: process.env.SERVER_HOST || '0.0.0.0',
		port: process.env.SERVER_PORT ?? '8001',
	});
}
