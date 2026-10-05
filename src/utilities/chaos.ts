/* eslint-disable @typescript-eslint/naming-convention */
import type { ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyReply } from 'fastify';

export type ChaosMode = 'every' | 'random';

// What a failing call gets:
// - http: an HTTP error in place of the reply
// - stream-error: the stream starts, then the provider's in-stream error
// - stream-drop: the stream starts, then the socket is destroyed
// - stream-stall: the stream starts, then nothing more is sent
export const chaosKinds = [
	'http',
	'stream-error',
	'stream-drop',
	'stream-stall',
] as const;

export type ChaosKind = (typeof chaosKinds)[number];

export interface ChaosSettings {
	enabled: boolean;
	// X in "1 in X calls"; 1 fails every call
	frequency: number;
	// every: calls X, 2X, 3X... fail. random: each call fails with chance 1/X
	mode: ChaosMode;
	// HTTP status of the injected error; picks the error type of a stream-error
	status: number;
	kind: ChaosKind;
	// Content deltas a stream sends before a stream-* kind fails it
	afterChunks: number;
}

/**
 * A stream that is to fail part-way through. The stream handler sends the
 * opening events and `afterChunks` content deltas, then calls failStream.
 */
export interface StreamFailure {
	kind: Exclude<ChaosKind, 'http'>;
	afterChunks: number;
	status: number;
}

const defaultChaosFrequency = 1;
const defaultChaosStatus = 500;
const defaultChaosAfterChunks = 2;

// Statuses a client is expected to wait on before retrying
const retryAfterStatuses = new Set([429, 503, 529]);

// Calls that could have failed, and how many of them did
let calls = 0;
let injected = 0;

// Responses a stream-stall is holding open, so shutdown can let go of them
const stalled = new Set<ServerResponse>();

// The chaos settings of this run. Anything that isn't valid falls back to its
// default: a frequency below 1, a mode other than "random", a status outside
// 400 to 599, an unknown kind, an afterChunks that isn't a whole number of 0
// or more.
export function getChaosConfig(): ChaosSettings {
	const frequency = Math.floor(Number(process.env?.CHAOS_FREQUENCY));
	const status = Math.floor(Number(process.env?.CHAOS_STATUS));
	const kind = process.env?.CHAOS_KIND?.toLowerCase() as ChaosKind;
	const afterChunks = process.env?.CHAOS_AFTER_CHUNKS ?? '';

	return {
		enabled: process.env?.CHAOS_ENABLED?.toLowerCase() === 'true',
		frequency: frequency >= 1 ? frequency : defaultChaosFrequency,
		mode:
			process.env?.CHAOS_MODE?.toLowerCase() === 'random'
				? 'random'
				: 'every',
		status: status >= 400 && status <= 599 ? status : defaultChaosStatus,
		kind: chaosKinds.includes(kind) ? kind : 'http',
		afterChunks: /^\d+$/.test(afterChunks)
			? Number(afterChunks)
			: defaultChaosAfterChunks,
	};
}

// Counts this call and says whether it is one that fails
export function shouldInjectError(): boolean {
	const { enabled, frequency, mode } = getChaosConfig();
	if (!enabled) return false;

	calls++;
	const fail =
		mode === 'random'
			? Math.random() < 1 / frequency
			: calls % frequency === 0;
	if (fail) injected++;

	return fail;
}

/**
 * Error body in the shape the given provider's API uses, so a client's own
 * error parsing is exercised. Anything other than claude or gemini gets the
 * OpenAI shape.
 */
export function buildChaosError(
	llmName: string | undefined,
	status: number,
): Record<string, unknown> {
	const message = `llmock chaos: simulated ${status} error`;

	if (llmName === 'claude') {
		const type =
			status === 429
				? 'rate_limit_error'
				: status === 529
					? 'overloaded_error'
					: 'api_error';
		return { type: 'error', error: { type, message } };
	}

	if (llmName === 'gemini') {
		const state =
			status === 429
				? 'RESOURCE_EXHAUSTED'
				: status === 503
					? 'UNAVAILABLE'
					: 'INTERNAL';
		return { error: { code: status, message, status: state } };
	}

	const rateLimited = status === 429;
	return {
		error: {
			message,
			type: rateLimited ? 'rate_limit_error' : 'server_error',
			param: null,
			code: rateLimited ? 'rate_limit_exceeded' : null,
		},
	};
}

/**
 * Leaves a response unanswered until the client disconnects, which is when it
 * is forgotten again. Nothing is scheduled, so there is no timer to clear.
 */
function holdOpen(raw: ServerResponse): void {
	if (raw.destroyed) return;

	stalled.add(raw);
	raw.once('close', () => stalled.delete(raw));
}

// How many content deltas a failing stream sends out of the `available` ones
export const streamedCount = (
	available: number,
	failure: StreamFailure,
): number => Math.max(0, Math.min(available, failure.afterChunks));

/**
 * Fails a stream that has already sent its opening events and deltas.
 * `format` is the stream's wire format: 'claude' for Anthropic SSE events,
 * anything else for the OpenAI-style stream.
 */
export function failStream(
	reply: FastifyReply,
	failure: StreamFailure,
	format: string,
): void {
	const { raw } = reply;
	if (raw.destroyed) return;

	if (failure.kind === 'stream-drop') {
		// Cut the connection once what was written has left, so the client
		// gets every delta that was sent before the drop
		const { socket } = raw;
		if (socket && !socket.destroyed) socket.write('', () => raw.destroy());
		else raw.destroy();
		return;
	}

	if (failure.kind === 'stream-stall') {
		holdOpen(raw);
		return;
	}

	// stream-error: the provider's in-stream error, then the end of the
	// response with none of the closing events (no [DONE] either)
	const error = JSON.stringify(
		buildChaosError(
			format === 'claude' ? 'claude' : 'openai',
			failure.status,
		),
	);
	raw.write(
		format === 'claude'
			? `event: error\ndata: ${error}\n\n`
			: `data: ${error}\n\n`,
	);
	raw.end();
}

/**
 * Fails this call if it is one that fails. Returns:
 * - false: not a failing call, carry on
 * - true: the reply has been dealt with, so the caller stops there
 * - a StreamFailure: the caller starts the stream and its handler fails it
 *   part-way through. Only for a call that asked for a stream (`streaming`)
 *   while a stream-* kind is set.
 */
export function applyChaos(
	reply: FastifyReply,
	llmName: string | undefined = process.env?.LLM_NAME,
	streaming: boolean = false,
): boolean | StreamFailure {
	if (!shouldInjectError()) return false;

	const { status, kind, afterChunks } = getChaosConfig();

	if (kind !== 'http' && streaming) {
		// The stream's headers go out with a 200 before it fails. Set on the
		// raw response because that is what the stream handlers write to.
		reply.raw.setHeader('x-llmock-chaos', 'true');
		return { kind, afterChunks, status };
	}

	// A call that did not ask for a stream has no stream to cut: a drop or
	// a stall happens before anything is sent
	if (kind === 'stream-drop') {
		reply.hijack();
		reply.raw.destroy();
		return true;
	}

	if (kind === 'stream-stall') {
		reply.hijack();
		holdOpen(reply.raw);
		return true;
	}

	// http, and a stream-error with no stream to put the error in
	reply.status(status).header('x-llmock-chaos', 'true');
	if (retryAfterStatuses.has(status)) reply.header('retry-after', '1');
	reply.send(buildChaosError(llmName, status));

	return true;
}

export function getChaosStats(): { calls: number; injected: number } {
	return { calls, injected };
}

// Connections a stream-stall is holding open right now
export function getStalledCount(): number {
	return stalled.size;
}

// Drops every connection a stream-stall is holding open
export function releaseStalled(): void {
	for (const raw of stalled) raw.destroy();
	stalled.clear();
}

/**
 * Lets the server close while a stalled connection is open. A stalled
 * response never finishes, so without this `app.close()` would wait on it
 * forever.
 */
export function releaseStalledOnClose(app: FastifyInstance): void {
	app.addHook('preClose', async () => releaseStalled());
}

export function resetChaos(): void {
	calls = 0;
	injected = 0;
	releaseStalled();
}
