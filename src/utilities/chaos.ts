/* eslint-disable @typescript-eslint/naming-convention */
import type { FastifyReply } from 'fastify';

export type ChaosMode = 'every' | 'random';

export interface ChaosSettings {
	enabled: boolean;
	// X in "1 in X calls"; 1 fails every call
	frequency: number;
	// every: calls X, 2X, 3X... fail. random: each call fails with chance 1/X
	mode: ChaosMode;
	// HTTP status of the injected error
	status: number;
}

const defaultChaosFrequency = 1;
const defaultChaosStatus = 500;

// Statuses a client is expected to wait on before retrying
const retryAfterStatuses = new Set([429, 503, 529]);

// Calls that could have failed, and how many of them did
let calls = 0;
let injected = 0;

// The chaos settings of this run. Anything that isn't valid falls back to its
// default: a frequency below 1, a mode other than "random", a status outside
// 400 to 599.
export function getChaosConfig(): ChaosSettings {
	const frequency = Math.floor(Number(process.env?.CHAOS_FREQUENCY));
	const status = Math.floor(Number(process.env?.CHAOS_STATUS));

	return {
		enabled: process.env?.CHAOS_ENABLED?.toLowerCase() === 'true',
		frequency: frequency >= 1 ? frequency : defaultChaosFrequency,
		mode:
			process.env?.CHAOS_MODE?.toLowerCase() === 'random'
				? 'random'
				: 'every',
		status: status >= 400 && status <= 599 ? status : defaultChaosStatus,
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
 * Sends a chaos error in place of the reply when this call is one that fails.
 * Returns true if it did, so the caller stops there.
 */
export function applyChaos(
	reply: FastifyReply,
	llmName: string | undefined = process.env?.LLM_NAME,
): boolean {
	if (!shouldInjectError()) return false;

	const { status } = getChaosConfig();

	reply.status(status).header('x-llmock-chaos', 'true');
	if (retryAfterStatuses.has(status)) reply.header('retry-after', '1');
	reply.send(buildChaosError(llmName, status));

	return true;
}

export function getChaosStats(): { calls: number; injected: number } {
	return { calls, injected };
}

export function resetChaos(): void {
	calls = 0;
	injected = 0;
}
