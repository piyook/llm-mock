/* eslint-disable @typescript-eslint/naming-convention */
import type { FastifyInstance } from 'fastify';
import { faker } from '@faker-js/faker';
import { db } from '../../models/db.js';
import { buildResponse } from '../../utilities/build-response.js';
import { validateRequest } from '../../utilities/validate-request.js';
import { delay, getDelayConfig } from '../../utilities/delay.js';
import { generateStreamingChunks, setStreamingHeaders, streamWithDelay } from '../../utilities/build-streaming-response.js';

// Add any http handler here (get, push ,delete etc., and middleware as needed)

const mockGPTResponse = async () => {
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

// Read STREAM env variable at startup
const isStreamingMode = process.env?.STREAM?.toLowerCase() === 'true';

function handler(app: FastifyInstance, pathName: string) {
	const prefix = process.env?.LLM_URL_ENDPOINT ?? '';
	const fullPath = prefix || pathName;

	// GET route
	app.get(`/${fullPath}`, async (request, reply) => {
		// Apply delay if configured
		const delayConfig = getDelayConfig();
		if (delayConfig.enabled) {
			await delay(delayConfig.min, delayConfig.max);
		}

		// === STATIC MODE ===
		// Load openai_res.json from src/response-templates, replace DYNAMIC_CONTENT_HERE 
		// with generated lorem/stored text, return as application/json
		if (!isStreamingMode) {
			const content = await mockGPTResponse();
			const response = await buildResponse(content);
			return reply.send(response);
		}

		// === STREAMING MODE ===
		// Use same generated content as static mode, but emit as OpenAI-style 
		// chat.completion.chunk events via Server-Sent Events (SSE)
		const content = await mockGPTResponse();
		const chunks = await generateStreamingChunks(content);
		
		setStreamingHeaders(reply);
		await streamWithDelay(chunks, reply);
		
		return reply;
	});

	// POST route
	app.post(`/${fullPath}`, async (request, reply) => {
		if (await validateRequest(request)) {
			// Apply delay if configured
			const delayConfig = getDelayConfig();
			if (delayConfig.enabled) {
				await delay(delayConfig.min, delayConfig.max);
			}

			// === STATIC MODE ===
			// Load openai_res.json from src/response-templates, replace DYNAMIC_CONTENT_HERE 
			// with generated lorem/stored text, return as application/json
			if (!isStreamingMode) {
				const content = await mockGPTResponse();
				const response = await buildResponse(content);
				return reply.send(response);
			}

			// === STREAMING MODE ===
			// Use same generated content as static mode, but emit as OpenAI-style 
			// chat.completion.chunk events via Server-Sent Events (SSE)
			// Streaming format mimics OpenAI chat-completion streaming API
			try {
				const content = await mockGPTResponse();
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
		}

		console.log(
			`\nREQUEST ERROR: Invalid or missing request format for this LLM Model:${process.env?.LLM_NAME?.toUpperCase()}`,
		);

		return reply
			.status(400)
			.type('text/plain')
			.send(
				`Invalid or Missing Request For This LLM Model Template: ${process.env?.LLM_NAME?.toUpperCase()} Model:${process.env?.LLM_MODEL ?? 'NO MODEL DEFINED'}. Please ensure your request adheres to the expected format - see localhost:${process.env?.SERVER_PORT ?? '8001'}/logs for details of missing parameters or formatting issues.`,
			);
	});
}

export default handler;
