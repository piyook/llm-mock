import fs from 'node:fs';
import path from 'node:path';
import envPaths from 'env-paths';
import type { FastifyRequest } from 'fastify';

// Get OS-appropriate log directory
const paths = envPaths('llm-mock');
const logFolder = paths.log;

// Ensure log directory exists
if (!fs.existsSync(logFolder)) {
	fs.mkdirSync(logFolder, { recursive: true });
}

// Holds the most recent validated requests, newest first
export const logPath = path.join(logFolder, 'api_request_log.json');

export const defaultLogEntries = 10;
export const logEntriesLimit = 100;

// How many requests the log keeps (older ones are dropped): the
// maxLoggedRequests setting, capped at the limit. Anything that isn't a
// number of 1 or more falls back to the default.
export function maxLogEntries(): number {
	const setting = Math.floor(Number(process.env?.MAX_LOGGED_REQUESTS));
	if (!(setting >= 1)) return defaultLogEntries;
	return Math.min(setting, logEntriesLimit);
}

// The entries already in the log file, [] if it is missing or unreadable
function readLogEntries(): unknown[] {
	try {
		const entries: unknown = JSON.parse(fs.readFileSync(logPath, 'utf8'));
		return Array.isArray(entries) ? entries : [];
	} catch {
		return [];
	}
}

// Empties the log by removing its file; fine if there is none
export function clearLog() {
	fs.rmSync(logPath, { force: true });
}

/**
 * Adds what the recording upstream answered to a call's log entry, found by
 * the x-llmock-request-id it was logged with. The entry is written when the
 * call is validated, before it is sent on, so this comes afterwards. Does
 * nothing when logging is off or the entry is no longer in the log.
 */
export function noteForwarded(
	requestId: string,
	forwarded: { status: number; saved: boolean },
) {
	if (process.env?.LOG_REQUESTS?.toUpperCase() !== 'ON') return;

	const entries = readLogEntries();
	const entry = entries.find(
		(candidate) =>
			(candidate as { request_validation?: { request_id?: unknown } })
				?.request_validation?.request_id === requestId,
	) as { request_validation: Record<string, unknown> } | undefined;
	if (!entry) return;

	entry.request_validation.forwarded = forwarded;
	fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
}

export default function logger(
	logItem: FastifyRequest,
	state = '',
	reason = '',
	information = '',
	// The x-llmock-request-id header sent back with the reply
	requestId?: string,
) {
	if (process.env?.LOG_REQUESTS?.toUpperCase() !== 'ON') return;

	const logEntry = {
		request_validation: {
			...(requestId ? { request_id: requestId } : {}),
			validation_status: state,
			reason,
			information,
			request_time: new Date().toLocaleString(),
		},
		sent_POST_request: logItem,
	};

	const entries = [logEntry, ...readLogEntries()].slice(0, maxLogEntries());

	fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
}
