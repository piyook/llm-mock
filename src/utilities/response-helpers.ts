import { faker } from '@faker-js/faker';
import { db } from '../models/db.js';
import { buildResponse } from './build-response.js';
import { generateStreamingChunks, setStreamingHeaders, streamWithDelay } from './build-streaming-response.js';
import type { FastifyReply } from 'fastify';

/**
 * Generates mock LLM response content based on configuration
 * Supports both lorem ipsum and stored response types
 * 
 * @returns Promise<string> Generated content text
 */
export const generateResponseContent = async (): Promise<string> => {
	let content = '';

	switch (process.env?.MOCK_LLM_RESPONSE_TYPE) {
		case 'lorem': {
			content = faker.lorem.sentences({
				min: 1,
				max: Number.parseInt(process.env?.MAX_LOREM_PARAS ?? '5', 10),
			});
			break;
		}

		case 'stored': {
			const storedResponses = db.llm.getAll();

			const random = faker.number.int({
				min: 0,
				max: storedResponses.length - 1,
			});
			content = storedResponses[random].content;

			break;
		}

		default: {
			content = faker.lorem.paragraphs({ min: 1, max: 10 });
		}
	}

	return content;
};

/**
 * Builds a static JSON response using the response template
 * Replaces DYNAMIC_CONTENT_HERE with generated content
 * 
 * @param content - The content to inject into the template
 * @returns Promise<object> Complete static response object
 */
export const buildStaticResponse = async (content: string) => {
	return await buildResponse(content);
};

/**
 * Handles streaming response with proper SSE format
 * Converts content to streaming chunks and sends them with appropriate headers
 * 
 * @param content - The content to stream
 * @param reply - Fastify reply object
 * @returns Promise<void>
 */
export const handleStreamingResponse = async (content: string, reply: FastifyReply) => {
	try {
		const chunks = await generateStreamingChunks(content);
		
		setStreamingHeaders(reply);
		await streamWithDelay(chunks, reply);
		
		return reply;
	} catch (error) {
		console.error('Streaming error:', error);
		// Handle streaming errors gracefully - close connection without crashing
		if (!reply.raw.destroyed) {
			reply.raw.end();
		}
		return;
	}
};

/**
 * Applies configured response delay if enabled
 * Uses RESPONSE_DELAY_MIN and RESPONSE_DELAY_MAX environment variables
 * 
 * @returns Promise<void>
 */
export const applyResponseDelay = async () => {
	const { getDelayConfig, delay } = await import('./delay.js');
	const delayConfig = getDelayConfig();
	
	if (delayConfig.enabled) {
		await delay(delayConfig.min, delayConfig.max);
	}
};
