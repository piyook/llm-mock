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

// How many requests the log keeps; older ones are dropped
export const maxLogEntries = 10;

// The entries already in the log file, [] if it is missing or unreadable
function readLogEntries(): unknown[] {
	try {
		const entries: unknown = JSON.parse(fs.readFileSync(logPath, 'utf8'));
		return Array.isArray(entries) ? entries : [];
	} catch {
		return [];
	}
}

export default function logger(
	logItem: FastifyRequest,
	state = '',
	reason = '',
	information = '',
) {
	if (process.env?.LOG_REQUESTS?.toUpperCase() !== 'ON') return;

	const logEntry = {
		request_validation: {
			validation_status: state,
			reason,
			information,
			request_time: new Date().toLocaleString(),
		},
		sent_POST_request: logItem,
	};

	const entries = [logEntry, ...readLogEntries()].slice(0, maxLogEntries);

	fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
}
