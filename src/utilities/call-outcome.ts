import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MockReply } from '../types.js';
import {
	forwardAndRecord,
	recordUpstream,
	type Passthrough,
} from './recordings.js';
import {
	applyChaos,
	applyRuleFailure,
	getChaosConfig,
	type StreamFailure,
} from './chaos.js';
import { describeRule, type RecordedRequest } from './request-recorder.js';
import { generateResponseContent, getRuleFailure } from './response-helpers.js';
import { countRuleUse, findRequestRule } from './runtime-rules.js';

export interface CallOutcome {
	/** The response rule the call matches, if any */
	matched: ReturnType<typeof findRequestRule>;
	/**
	 * true: the call has been dealt with (an error was sent, or the
	 * connection dropped or stalled), so the route stops there. A
	 * StreamFailure: the route starts its stream and fails it part-way
	 * through. undefined: the route replies as usual.
	 */
	failure: true | StreamFailure | undefined;
}

/**
 * Decides how a chat call is answered, before any reply is built. A response
 * rule with `fail` fails every call that matches it; otherwise chaos mode
 * decides whether this call fails. The rule is found once, so the failure and
 * the reply are the same rule's. What is decided is written into `record`.
 *
 * @param errorFormat - The wire format of an HTTP error body
 */
export const decideCall = (
	reply: FastifyReply,
	body: unknown,
	record: RecordedRequest,
	streaming: boolean,
	errorFormat: string | undefined,
): CallOutcome => {
	const matched = findRequestRule(body);
	const ruleFailure = getRuleFailure(body, matched);
	const chaos = ruleFailure
		? applyRuleFailure(reply, ruleFailure, errorFormat, streaming)
		: applyChaos(reply, errorFormat, streaming);

	// A call that chaos fails is not one of the calls a rule with `times`
	// answers: the rule is still there for the retry
	if (ruleFailure || !chaos) {
		countRuleUse(matched?.rule);
		if (matched) record.rule = describeRule(matched.rule);
	}

	if (ruleFailure) record.failed = { by: 'rule', ...ruleFailure };
	else if (chaos) {
		const { kind, status, afterChunks } = getChaosConfig();
		record.failed = { by: 'chaos', kind, status, afterChunks };
	}

	if (chaos === true) {
		// No stream was started: an error reply, or for a drop or a stall no
		// reply at all
		const kind = record.failed?.kind;
		record.streamed =
			kind === 'stream-drop' || kind === 'stream-stall' ? null : false;
		return { matched, failure: true };
	}

	record.streamed = streaming;
	return { matched, failure: chaos || undefined };
};

/**
 * What a call is answered with: the matched rule's reply or a generated one,
 * or, when recording and no rule matched a POST, the upstream's reply (see
 * recordings.ts). A Passthrough is the upstream's answer to send back as it
 * came: an error, or a reply that could not be recorded.
 *
 * @param format - The route's wire format: openai, claude, gemini or responses
 */
export const getReply = async (
	request: FastifyRequest,
	matched: CallOutcome['matched'],
	record: RecordedRequest,
	format: string | undefined,
): Promise<MockReply | Passthrough> => {
	if (matched || request.method !== 'POST' || !recordUpstream()) {
		return generateResponseContent(request.body, matched);
	}

	try {
		const outcome = await forwardAndRecord(request, format);
		record.forwarded = { status: outcome.status, saved: outcome.saved };
		return 'reply' in outcome ? outcome.reply : outcome.passthrough;
	} catch (error) {
		const message = `llmock could not reach the recording upstream ${recordUpstream()}: ${(error as Error).message}`;
		console.warn(`RECORDING: ${message}`);
		record.forwarded = { status: 502, saved: false };
		return {
			status: 502,
			contentType: 'application/json',
			body: JSON.stringify({
				error: { type: 'llmock_upstream', message },
			}),
		};
	}
};

export const isPassthrough = (
	reply: MockReply | Passthrough,
): reply is Passthrough => 'status' in reply && 'body' in reply;

// Sends an upstream's answer back as it came
export const sendPassthrough = (
	reply: FastifyReply,
	{ status, contentType, body }: Passthrough,
) => {
	reply.status(status);
	if (contentType) reply.type(contentType);
	return reply.send(body);
};
