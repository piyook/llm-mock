/* eslint-disable @typescript-eslint/naming-convention */
import type { FastifyInstance } from 'fastify';
import { validateRequest } from '../../utilities/validate-request.js';
import { 
	generateResponseContent, 
	buildStaticResponse, 
	handleStreamingResponse, 
	applyResponseDelay 
} from '../../utilities/response-helpers.js';

// Read STREAM env variable at startup
// Controls whether responses are sent as static JSON or SSE streams
// STREAM=true: Returns OpenAI-style Server-Sent Events stream
// STREAM=false: Returns single static JSON response (default behavior)
const isStreamingMode = process.env?.STREAM?.toLowerCase() === 'true';

/**
 * Handles the common request processing logic for both GET and POST routes
 * Applies delay, generates content, and returns appropriate response format
 * 
 * @param reply - Fastify reply object
 * @returns Promise<void>
 */
const handleRequest = async (reply: any) => {
	// Apply configured response delay for realistic API simulation
	await applyResponseDelay();

	// Generate mock response content (lorem or stored based on configuration)
	const content = await generateResponseContent();

	// Route to appropriate response handler based on STREAM environment variable
	if (!isStreamingMode) {
		// === STATIC MODE ===
		// Returns single JSON response matching OpenAI chat.completion format
		// Uses openai_res.json template with DYNAMIC_CONTENT_HERE replacement
		const response = await buildStaticResponse(content);
		return reply.send(response);
	} else {
		// === STREAMING MODE ===
		// Returns OpenAI-style Server-Sent Events stream with chat.completion.chunk events
		// Streaming format is compatible with OpenAI chat-completions streaming API
		// Content is split into multiple chunks with proper SSE headers and timing
		return await handleStreamingResponse(content, reply);
	}
};

function handler(app: FastifyInstance, pathName: string) {
	const prefix = process.env?.LLM_URL_ENDPOINT ?? '';
	const fullPath = prefix || pathName;

	// GET route - handles chat completion requests via HTTP GET
	// Supports both static and streaming modes based on STREAM env variable
	app.get(`/${fullPath}`, async (request, reply) => {
		return await handleRequest(reply);
	});

	// POST route - handles chat completion requests via HTTP POST
	// Validates request format against openai_req.json template before processing
	// Supports both static and streaming modes based on STREAM env variable
	app.post(`/${fullPath}`, async (request, reply) => {
		// Validate incoming request against template to ensure API compatibility
		if (await validateRequest(request)) {
			return await handleRequest(reply);
		}

		// Return detailed error message for invalid requests
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
