import { faker } from '@faker-js/faker';
import { delay, getDelayConfig } from './delay.js';
import { buildResponse } from './build-response.js';

export interface StreamingChunk {
	id: string;
	object: 'chat.completion.chunk';
	created: number;
	model: string;
	choices: Array<{
		index: number;
		delta: {
			role?: string;
			content?: string;
		};
		finish_reason: 'stop' | null;
	}>;
}

/**
 * Convert static response template to streaming chunks
 * 
 * This function implements OpenAI-compatible streaming format:
 * - Uses the same template structure as static responses for consistency
 * - Splits content into multiple chunks to simulate token-by-token streaming
 * - Follows OpenAI's chat.completion.chunk object structure
 * - Emits proper SSE format with data: prefix and [DONE] sentinel
 * 
 * OpenAI Compatibility Assumptions:
 * - First chunk contains only the role in delta (no content)
 * - Middle chunks contain incremental content fragments
 * - Final chunk has finish_reason: 'stop' and empty delta
 * - All chunks share the same id prefix with incremental suffixes
 * - Uses same created timestamp and model as static template
 * 
 * @param content - The full content to be streamed
 * @returns Promise<string[]> Array of SSE-formatted chunks
 */
export const generateStreamingChunks = async (content: string): Promise<string[]> => {
	const chunks: string[] = [];
	
	// Get the static response template to extract id, model, etc.
	// This ensures streaming responses match static template structure
	const staticResponse = await buildResponse(content) as any;
	
	// Extract base properties from the static template for consistency
	const baseId = staticResponse.id || `chatcmpl-${faker.string.alphanumeric(10)}`;
	const model = staticResponse.model || (process.env.LLM_MODEL ?? 'gpt-4o');
	const created = staticResponse.created || Math.floor(Date.now() / 1000);

	// Split content into words for realistic streaming simulation
	// This mimics how real LLMs stream responses token by token
	const words = content.split(' ');
	const chunkSize = Math.max(1, Math.floor(words.length / 5)); // Split into ~5 chunks

	// First chunk with role (OpenAI format requirement)
	// Extract role from static template or default to assistant
	const role = staticResponse.choices?.[0]?.message?.role || 'assistant';
	const firstChunk: StreamingChunk = {
		id: `${baseId}-0`,
		object: 'chat.completion.chunk',
		created,
		model,
		choices: [
			{
				index: 0,
				delta: {
					role,
				},
				finish_reason: null,
			},
		],
	};
	chunks.push(`data: ${JSON.stringify(firstChunk)}`);

	// Content chunks - streaming the actual response text
	for (let i = 0; i < words.length; i += chunkSize) {
		const chunkWords = words.slice(i, i + chunkSize);
		const chunkContent = chunkWords.join(' ');
		
		const chunk: StreamingChunk = {
			id: `${baseId}-${Math.floor(i / chunkSize) + 1}`,
			object: 'chat.completion.chunk',
			created,
			model,
			choices: [
				{
					index: 0,
					delta: {
						content: i === 0 ? chunkContent : ` ${chunkContent}`, // Add space for subsequent chunks
					},
					finish_reason: null,
				},
			],
		};
		chunks.push(`data: ${JSON.stringify(chunk)}`);
	}

	// Final chunk with finish_reason (OpenAI format requirement)
	// Extract finish_reason from static template or default to stop
	const finishReason = staticResponse.choices?.[0]?.finish_reason || 'stop';
	const finalChunk: StreamingChunk = {
		id: `${baseId}-final`,
		object: 'chat.completion.chunk',
		created,
		model,
		choices: [
			{
				index: 0,
				delta: {}, // Empty delta for final chunk
				finish_reason: finishReason as 'stop',
			},
		],
	};
	chunks.push(`data: ${JSON.stringify(finalChunk)}`);

	// Add [DONE] sentinel (OpenAI streaming requirement)
	// This signals the end of the stream to clients
	chunks.push('data: [DONE]');

	return chunks;
};

/**
 * Sets proper Server-Sent Events headers for streaming responses
 * 
 * These headers ensure compatibility with OpenAI's streaming format:
 * - text/event-stream: Indicates SSE content type
 * - no-cache: Prevents caching of streaming responses
 * - keep-alive: Maintains connection for streaming
 * - CORS headers: Allows cross-origin requests
 * 
 * @param reply - Fastify reply object
 */
export const setStreamingHeaders = (reply: any) => {
	reply.header('Content-Type', 'text/event-stream');
	reply.header('Cache-Control', 'no-cache');
	reply.header('Connection', 'keep-alive');
	reply.header('Access-Control-Allow-Origin', '*');
	reply.header('Access-Control-Allow-Headers', 'Cache-Control');
};

/**
 * Streams chunks with appropriate timing for realistic simulation
 * 
 * Distributes configured delay across chunks to simulate natural streaming:
 * - Calculates per-chunk delay from total delay configuration
 * - Ensures minimum delay between chunks for realistic timing
 * - Flushes each chunk immediately for real-time delivery
 * - Handles connection errors gracefully
 * 
 * @param chunks - Array of SSE-formatted chunks to stream
 * @param reply - Fastify reply object
 * @returns Promise<void>
 */
export const streamWithDelay = async (chunks: string[], reply: any): Promise<void> => {
	const delayConfig = getDelayConfig();
	
	// Calculate per-chunk delay (distribute total delay across chunks)
	// This ensures realistic streaming timing regardless of content length
	const perChunkDelay = delayConfig.enabled 
		? Math.max(50, (delayConfig.min + delayConfig.max) / 2 / chunks.length)
		: 50; // Minimum 50ms between chunks for realistic streaming

	for (const chunk of chunks) {
		reply.raw.write(`${chunk}\n\n`);
		
		// Apply delay between chunks (except for the last [DONE] message)
		// This simulates the natural timing of LLM token generation
		if (chunk !== 'data: [DONE]') {
			await delay(perChunkDelay, perChunkDelay);
		}
	}
	
	reply.raw.end();
};
