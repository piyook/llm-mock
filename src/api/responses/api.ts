import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { validateRequest } from '../../utilities/validate-request.js';
import { applyResponseDelay } from '../../utilities/response-helpers.js';

import {
	buildResponsesResponse,
	handleResponsesStreamingResponse,
	responsesPaths,
} from '../../utilities/build-responses-response.js';
import { shouldStream } from '../../utilities/stream-mode.js';
import {
	decideCall,
	getReply,
	isPassthrough,
	sendPassthrough,
} from '../../utilities/call-outcome.js';
import {
	recordRequest,
	type RecordedRequest,
} from '../../utilities/request-recorder.js';

/**
 * The OpenAI Responses API, `POST /v1/responses` (and `<prefix>/responses`
 * beside a `<prefix>/chat/completions` endpoint, see responsesPaths), served
 * beside the chat route by presets with the `openai` template. Response rules, chaos, the
 * delay, validation, the request log and the recorded requests work as they
 * do on the chat route. Streamed when the request sends `stream: true` (with
 * no `stream`, the preset's setting decides, as on the chat route).
 */
const handleRequest = async (
	request: FastifyRequest,
	reply: FastifyReply,
	record: RecordedRequest,
) => {
	// A GET has no body: it gets a generated reply (a quick smoke test)
	const body = request.method === 'POST' ? request.body : undefined;
	await applyResponseDelay();

	const streaming = shouldStream('openai', body, process.env?.STREAM);
	const { matched, failure } = decideCall(
		reply,
		body,
		record,
		streaming,
		'openai',
	);
	if (failure === true) return reply;

	const mockReply = await getReply(request, matched, record, 'responses');
	if (isPassthrough(mockReply)) {
		record.streamed = false;
		return sendPassthrough(reply, mockReply);
	}

	if (!streaming) return reply.send(buildResponsesResponse(mockReply, body));

	return handleResponsesStreamingResponse(mockReply, reply, body, failure);
};

function handler(app: FastifyInstance) {
	for (const route of responsesPaths()) register(app, route);
}

function register(app: FastifyInstance, route: string) {
	// A generated reply with no validation and no rules (a quick smoke test),
	// as on the chat route
	app.get(`/${route}`, async (request, reply) => {
		return handleRequest(request, reply, recordRequest(request));
	});

	app.post(`/${route}`, async (request, reply) => {
		if (await validateRequest(request, 'openai_responses')) {
			return handleRequest(request, reply, recordRequest(request));
		}

		recordRequest(request, false);
		console.log(
			'\nREQUEST ERROR: Invalid or missing request format for the Responses API',
		);

		return reply
			.status(400)
			.type('text/plain')
			.send(
				`Invalid or Missing Request For The Responses API (/${route}). Please ensure your request has the keys of the openai_responses request template - see localhost:${process.env?.SERVER_PORT ?? '8001'}/ui-request-log for details of missing parameters or formatting issues.`,
			);
	});
}

export default handler;
