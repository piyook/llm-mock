/* eslint-disable @typescript-eslint/naming-convention */
import type { FastifyInstance } from 'fastify';
import { validateRequest } from '../../utilities/validate-request.js';
import {
	generateResponseContent,
	getRuleFailure,
	buildStaticResponse,
	handleStreamingResponse,
	applyResponseDelay,
} from '../../utilities/response-helpers.js';
import { buildClaudeStaticResponse } from '../../utilities/build-claude-response.js';
import { handleClaudeStreamingResponse } from '../../utilities/build-claude-streaming-response.js';
import { shouldStream } from '../../utilities/stream-mode.js';
import { applyChaos, applyRuleFailure } from '../../utilities/chaos.js';
import {
	countRuleUse,
	findRequestRule,
} from '../../utilities/runtime-rules.js';

// Static JSON vs SSE stream is decided per request by shouldStream():
// - claude preset: the request body's `stream` field
// - other presets: the STREAM env variable (true = OpenAI-style SSE, default false)

/**
 * Handles the common request processing logic for both GET and POST routes
 * Applies delay, generates content, and returns appropriate response format
 *
 * @param reply - Fastify reply object
 * @param body - Parsed request body (undefined for GET requests)
 * @returns Promise<void>
 */
const handleRequest = async (reply: any, body?: unknown) => {
	// Apply configured response delay for realistic API simulation
	await applyResponseDelay();

	// Static JSON or an SSE stream (see shouldStream for the rules)
	const streaming = shouldStream(
		process.env?.LLM_NAME,
		body,
		process.env?.STREAM,
	);

	// A response rule with `fail` fails every call that matches it. Otherwise
	// chaos mode decides: this call may get an error in place of a reply, or
	// a stream that fails part-way through
	// The rule is found once, so the failure and the reply are the same rule's
	const matched = findRequestRule(body);
	const ruleFailure = getRuleFailure(body, matched);
	const chaos = ruleFailure
		? applyRuleFailure(reply, ruleFailure, process.env?.LLM_NAME, streaming)
		: applyChaos(reply, process.env?.LLM_NAME, streaming);
	// A call that chaos fails is not one of the calls a rule with `times`
	// answers: the rule is still there for the retry
	if (ruleFailure || !chaos) countRuleUse(matched?.rule);
	if (chaos === true) return reply;
	const streamFailure = chaos || undefined;

	// Generate the mock reply (rule fixture, lorem or stored based on configuration)
	const mockReply = await generateResponseContent(body, matched);

	// Route to appropriate response handler
	if (!streaming) {
		// === STATIC MODE ===
		// Returns single JSON response matching OpenAI chat.completion format
		// Uses openai_res.json template with DYNAMIC_CONTENT_HERE replacement
		// The claude preset adds a unique id, echoed model and token usage
		const response =
			process.env?.LLM_NAME === 'claude'
				? await buildClaudeStaticResponse(mockReply, body)
				: await buildStaticResponse(mockReply);
		return reply.send(response);
	}

	if (process.env?.LLM_NAME === 'claude') {
		// === CLAUDE STREAMING MODE ===
		// Anthropic Messages SSE events (message_start ... message_stop)
		return await handleClaudeStreamingResponse(
			mockReply,
			reply,
			body,
			streamFailure,
		);
	}

	// === STREAMING MODE ===
	// Returns OpenAI-style Server-Sent Events stream with chat.completion.chunk events
	// Streaming format is compatible with OpenAI chat-completions streaming API
	// Content is split into multiple chunks with proper SSE headers and timing
	return await handleStreamingResponse(mockReply, reply, streamFailure);
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
			return await handleRequest(reply, request.body);
		}

		// Return detailed error message for invalid requests
		console.log(
			`\nREQUEST ERROR: Invalid or missing request format for this LLM Model:${process.env?.LLM_NAME?.toUpperCase()}`,
		);

		return reply
			.status(400)
			.type('text/plain')
			.send(
				`Invalid or Missing Request For This LLM Model Template: ${process.env?.LLM_NAME?.toUpperCase()} Model:${process.env?.LLM_MODEL ?? 'NO MODEL DEFINED'}. Please ensure your request adheres to the expected format - see localhost:${process.env?.SERVER_PORT ?? '8001'}/ui-request-log for details of missing parameters or formatting issues.`,
			);
	});
}

export default handler;
