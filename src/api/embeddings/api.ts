/* eslint-disable @typescript-eslint/naming-convention */
import type { FastifyInstance } from 'fastify';
import { generateMockEmbeddings } from '../../utilities/response-helpers.js';
import { applyResponseDelay } from '../../utilities/response-helpers.js';

// Import the default dimensions constant
const DEFAULT_EMBEDDING_DIMENSIONS =
	Number(process.env?.EMBEDDING_DIMENSION) || 128;

/**
 * Custom validation function for embeddings requests
 * Uses the embeddings-specific request template
 */
const validateEmbeddingsRequest = async (request: any) => {
	// Check if validation is disabled
	if (process.env.VALIDATE_REQUESTS !== 'ON') {
		return true;
	}

	// Check request has a body and it is an object
	if (typeof request.body !== 'object' || request.body === null) {
		console.log('ERROR: missing request body');
		return false;
	}

	const data = request.body;

	// Define required fields for embeddings API
	const requiredKeys = ['model', 'input'];

	if (typeof data !== 'object' || data === null) {
		return false;
	}

	const requestKeys = Object.keys(data);

	// Check if all required keys are present
	for (const key of requiredKeys) {
		if (!requestKeys.includes(key)) {
			console.log(`Missing required key: ${key}`);
			return false;
		}
	}

	return true;
};

/**
 * Handles the embeddings request processing logic
 * Applies delay, generates mock embeddings, and returns appropriate response
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @returns Promise<void>
 */
const handleEmbeddingsRequest = async (request: any, reply: any) => {
	// Apply configured response delay for realistic API simulation
	await applyResponseDelay();

	// Extract and parse request parameters
	// For GET requests, use query params; for POST requests, use body
	const source = request.body || request.query || {};
	const {
		model = 'text-embedding-ada-002',
		input = 'Default embedding text',
		dimensions = DEFAULT_EMBEDDING_DIMENSIONS,
	} = source as any;

	// Normalize input to array (handle both string and array inputs)
	const inputArray = Array.isArray(input) ? input : [input];

	// Generate mock embeddings using the helper function
	const embeddingsResponse = await generateMockEmbeddings(
		model,
		inputArray,
		dimensions,
	);

	return reply.send(embeddingsResponse);
};

function handler(app: FastifyInstance, _pathName: string) {
	// Check if embeddings mock is enabled
	const embeddingsEnabled =
		process.env?.ENABLE_EMBEDDINGS_MOCK?.toLowerCase() !== 'false';

	if (!embeddingsEnabled) {
		console.log(
			'Embeddings endpoint is disabled (ENABLE_EMBEDDINGS_MOCK=false)',
		);
		return; // Don't register routes if embeddings are disabled
	}

	// Use a fixed embeddings endpoint path that matches OpenAI's API
	const embeddingsPath = 'v1/embeddings';

	// GET route - handles embeddings requests via HTTP GET
	app.get(`/${embeddingsPath}`, async (request, reply) => {
		return await handleEmbeddingsRequest(request, reply);
	});

	// POST route - handles embeddings requests via HTTP POST
	// Validates request format against openai_embeddings_req.json template before processing
	app.post(`/${embeddingsPath}`, async (request, reply) => {
		// Validate incoming request against embeddings template to ensure API compatibility
		if (await validateEmbeddingsRequest(request)) {
			return await handleEmbeddingsRequest(request, reply);
		}

		// Return detailed error message for invalid requests
		console.log(
			`\nREQUEST ERROR: Invalid or missing request format for embeddings endpoint`,
		);

		return reply
			.status(400)
			.type('text/plain')
			.send(
				`Invalid or Missing Request For Embeddings Template. Please ensure your request adheres to the expected format - see localhost:${process.env?.SERVER_PORT ?? '8001'}/logs for details of missing parameters or formatting issues.`,
			);
	});
}

export default handler;
