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
 * Reuses openai_res.json structure for id, model, and other fields
 */
export const generateStreamingChunks = async (content: string): Promise<string[]> => {
	const chunks: string[] = [];
	
	// Get the static response template to extract id, model, etc.
	const staticResponse = await buildResponse(content) as any;
	
	// Extract base properties from the static template
	const baseId = staticResponse.id || `chatcmpl-${faker.string.alphanumeric(10)}`;
	const model = staticResponse.model || (process.env.LLM_MODEL ?? 'gpt-4o');
	const created = staticResponse.created || Math.floor(Date.now() / 1000);

	// Split content into words for realistic streaming
	const words = content.split(' ');
	const chunkSize = Math.max(1, Math.floor(words.length / 5)); // Split into ~5 chunks

	// First chunk with role (extract role from static template or default to assistant)
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

	// Content chunks
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
						content: i === 0 ? chunkContent : ` ${chunkContent}`,
					},
					finish_reason: null,
				},
			],
		};
		chunks.push(`data: ${JSON.stringify(chunk)}`);
	}

	// Final chunk with finish_reason (extract from static template or default to stop)
	const finishReason = staticResponse.choices?.[0]?.finish_reason || 'stop';
	const finalChunk: StreamingChunk = {
		id: `${baseId}-final`,
		object: 'chat.completion.chunk',
		created,
		model,
		choices: [
			{
				index: 0,
				delta: {},
				finish_reason: finishReason as 'stop',
			},
		],
	};
	chunks.push(`data: ${JSON.stringify(finalChunk)}`);

	// Add [DONE] sentinel
	chunks.push('data: [DONE]');

	return chunks;
};

export const setStreamingHeaders = (reply: any) => {
	reply.header('Content-Type', 'text/event-stream');
	reply.header('Cache-Control', 'no-cache');
	reply.header('Connection', 'keep-alive');
	reply.header('Access-Control-Allow-Origin', '*');
	reply.header('Access-Control-Allow-Headers', 'Cache-Control');
};

export const streamWithDelay = async (chunks: string[], reply: any): Promise<void> => {
	const delayConfig = getDelayConfig();
	
	// Calculate per-chunk delay (distribute total delay across chunks)
	const perChunkDelay = delayConfig.enabled 
		? Math.max(50, (delayConfig.min + delayConfig.max) / 2 / chunks.length)
		: 50; // Minimum 50ms between chunks for realistic streaming

	for (const chunk of chunks) {
		reply.raw.write(`${chunk}\n\n`);
		
		// Apply delay between chunks (except for the last [DONE] message)
		if (chunk !== 'data: [DONE]') {
			await delay(perChunkDelay, perChunkDelay);
		}
	}
	
	reply.raw.end();
};
