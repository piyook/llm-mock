import { faker } from '@faker-js/faker';
import { db } from '../models/db.js';
import { buildResponse } from './build-response.js';
import {
	generateStreamingChunks,
	setStreamingHeaders,
	streamWithDelay,
} from './build-streaming-response.js';
import { getStoredResponsesFile } from '../config/config-loader.js';
import {
	findMatchingRule,
	loadRuleContent,
	ruleFailure,
	ruleHasReply,
} from './response-rules.js';
import { getActiveRules } from './runtime-rules.js';
import { loadStoredResponses } from './stored-responses.js';
import { applyStopReason } from './stop-reason.js';
import {
	failStream,
	streamedCount,
	type CallFailure,
	type StreamFailure,
} from './chaos.js';
import type { MockReply } from '../types.js';
import type { FastifyReply } from 'fastify';

// Default embedding dimension constant
const DEFAULT_EMBEDDING_DIMENSIONS =
	Number(process.env?.EMBEDDING_DIMENSION) || 128;

/**
 * Fixture reply for this request if a response rule matches it, otherwise
 * undefined (a normal response is generated instead).
 */
const getRuleReply = (requestBody: unknown): MockReply | undefined => {
	const { rules, baseDir } = getActiveRules();
	const rule = findMatchingRule(rules, requestBody);
	// A rule that only fails has no reply: one is generated as usual
	if (!rule || !ruleHasReply(rule)) return undefined;

	return {
		text: loadRuleContent(rule, baseDir),
		...(rule.stopReason && { stopReason: rule.stopReason }),
	};
};

/**
 * How this request fails if the response rule it matches has `fail`,
 * otherwise undefined.
 */
export const getRuleFailure = (
	requestBody: unknown,
): CallFailure | undefined => {
	const rule = findMatchingRule(getActiveRules().rules, requestBody);

	return rule && ruleFailure(rule);
};

/**
 * Generates the mock LLM reply based on configuration
 * Supports response rules (fixture files), lorem ipsum and stored response types
 *
 * @param requestBody - Parsed request body, used to match response rules
 * @returns Promise<MockReply> The reply, with the generated text in `text`
 */
export const generateResponseContent = async (
	requestBody?: unknown,
): Promise<MockReply> => {
	// A matching responseRules entry wins over the configured response type
	const ruleReply = getRuleReply(requestBody);
	if (ruleReply !== undefined) return ruleReply;

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
			// The preset's own file if configured (re-read per request, like
			// rule fixtures), otherwise the texts bundled with the package
			const { file, baseDir } = getStoredResponsesFile();
			const storedResponses = file
				? loadStoredResponses(file, baseDir)
				: db.llm.getAll().map((item) => item.content);

			const random = faker.number.int({
				min: 0,
				max: storedResponses.length - 1,
			});
			content = storedResponses[random];

			break;
		}

		default: {
			content = faker.lorem.paragraphs({ min: 1, max: 10 });
		}
	}

	return { text: content };
};

/**
 * Builds a static JSON response using the response template
 * Replaces DYNAMIC_CONTENT_HERE with the reply's text, then writes in the
 * reply's stop reason if it has one
 *
 * @param mockReply - The reply whose text is injected into the template
 * @returns Promise<object> Complete static response object
 */
export const buildStaticResponse = async (mockReply: MockReply) => {
	return applyStopReason(
		await buildResponse(mockReply.text),
		process.env.LLM_NAME ?? 'openai',
		mockReply.stopReason,
	);
};

/**
 * Handles streaming response with proper SSE format
 * Converts the reply's text to streaming chunks and sends them with appropriate headers
 *
 * @param mockReply - The reply whose text is streamed
 * @param reply - Fastify reply object
 * @param failure - Chaos: fail the stream part-way through (see chaos.ts)
 * @returns Promise<void>
 */
export const handleStreamingResponse = async (
	mockReply: MockReply,
	reply: FastifyReply,
	failure?: StreamFailure,
) => {
	try {
		const chunks = await generateStreamingChunks(
			mockReply.text,
			mockReply.stopReason,
		);

		setStreamingHeaders(reply);

		if (failure) {
			// The role chunk and some content chunks, then the failure in
			// place of the finish_reason chunk and [DONE]
			const sent = chunks.slice(
				0,
				1 + streamedCount(chunks.length - 3, failure),
			);
			await streamWithDelay(sent, reply, false);
			failStream(reply, failure, 'openai');
			return reply;
		}

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
 * Generates deterministic mock embedding vectors using a seeded PRNG
 * Creates arrays of floats that look like realistic embeddings
 *
 * @param input - Input text for deterministic generation
 * @param model - Model name for additional seeding
 * @param dimensions - Number of dimensions for the embedding vector (default: 128)
 * @returns Promise<number[]> Mock embedding vector
 */
export const generateMockEmbedding = async (
	input: string,
	model: string = 'text-embedding-ada-002',
	dimensions: number = DEFAULT_EMBEDDING_DIMENSIONS,
): Promise<number[]> => {
	const embedding: number[] = [];

	// Create deterministic seed from input and model
	const seedInput = `${model}:${input}`;

	// Simple but effective hash function (djb2 algorithm)
	let hash = 5381;
	for (let i = 0; i < seedInput.length; i++) {
		hash = (hash << 5) + hash + seedInput.charCodeAt(i);
	}

	// Convert to 32-bit unsigned integer
	const seed = hash >>> 0;

	// Xorshift32 PRNG - simple, fast, and good for deterministic generation
	let state = seed;
	const xorshift32 = () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0xffffffff; // Normalize to [0, 1]
	};

	// Generate deterministic embedding values
	for (let i = 0; i < dimensions; i++) {
		// Generate value in [-1, 1] range
		const value = xorshift32() * 2 - 1;
		// Round to 4 decimal places for cleaner output
		embedding.push(Math.round(value * 10000) / 10000);
	}

	return embedding;
};

/**
 * Generates mock embeddings response object using template-based approach
 * Follows the project pattern of loading templates and replacing DYNAMIC_CONTENT_HERE
 *
 * @param model - Model name for the response
 * @param inputArray - Array of input texts
 * @param dimensions - Embedding dimensions (default: 128)
 * @returns Promise<object> Complete embeddings response object
 */
export const generateMockEmbeddings = async (
	model: string,
	inputArray: string[],
	dimensions: number = DEFAULT_EMBEDDING_DIMENSIONS,
) => {
	// Import the embeddings response template. /v1/embeddings is OpenAI-shaped
	// whichever chat preset is active, so the template doesn't follow LLM_NAME.
	const responseTemplate = (await import(
		/* @vite-ignore */
		'../response-templates/openai_embeddings_res.json',
		{ with: { type: 'json' } }
	)) as any;

	// Use structuredClone to create a deep copy of the template
	const newResponse = structuredClone(responseTemplate.default[0]);

	// Generate embeddings for each input
	const dataItems: Array<{
		object: string;
		index: number;
		embedding: number[];
	}> = [];
	for (let i = 0; i < inputArray.length; i++) {
		const embedding = await generateMockEmbedding(
			inputArray[i],
			model,
			dimensions,
		);
		dataItems.push({
			object: 'embedding',
			index: i,
			embedding: embedding,
		});
	}

	// Calculate token usage - simple word-based estimation
	const totalText = inputArray.join(' ');
	const promptTokens = Math.max(1, Math.ceil(totalText.split(/\s+/).length));

	// Replace DYNAMIC_CONTENT_HERE placeholders with actual values
	const replaceDynamicContent = (obj: any): any => {
		if (typeof obj === 'string' && obj === 'DYNAMIC_CONTENT_HERE') {
			// Handle different placeholders based on context
			return null; // Will be replaced specifically below
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => replaceDynamicContent(item));
		}

		if (typeof obj === 'object' && obj !== null) {
			const newObj: any = {};
			for (const key in obj) {
				if (Object.hasOwn(obj, key)) {
					if (obj[key] === 'DYNAMIC_CONTENT_HERE') {
						// Replace specific placeholders
						if (key === 'embedding') {
							// This will be handled per data item
							newObj[key] = dataItems[0].embedding; // Placeholder, will be overridden
						} else if (key === 'model') {
							newObj[key] = model;
						} else if (
							key === 'prompt_tokens' ||
							key === 'total_tokens'
						) {
							newObj[key] = promptTokens;
						} else {
							newObj[key] = replaceDynamicContent(obj[key]);
						}
					} else {
						newObj[key] = replaceDynamicContent(obj[key]);
					}
				}
			}
			return newObj;
		}

		return obj;
	};

	// Apply template replacements
	const response = replaceDynamicContent(newResponse);

	// Override data array with generated embeddings
	response.data = dataItems;
	response.model = model;
	response.usage.prompt_tokens = promptTokens;
	response.usage.total_tokens = promptTokens;

	return response;
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
