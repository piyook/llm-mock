import type { FastifyRequest } from 'fastify';
import {
	collectLastMessageStrings,
	collectStrings,
	type ResponseRule,
} from './response-rules.js';
import type { CallFailure } from './chaos.js';

/**
 * Every call to the chat and embeddings routes, held in memory so a test can
 * check what its app sent (`GET /admin/requests`, or `requests()` on a server
 * from startServer). Unlike the request log it is always on, also records
 * calls that fail validation, and is not written to disk.
 */
export interface RecordedRequest {
	/** The same id as the reply's x-llmock-request-id header */
	id: string;
	/** When the call came in, as an ISO 8601 timestamp */
	time: string;
	method: string;
	/** The route, without the query string */
	path: string;
	/** Credentials (`key`, `api_key`, `access_token`...) are "[redacted]" */
	query: Record<string, unknown>;
	/** Header names in lower case; credentials are replaced by "[redacted]" */
	headers: Record<string, unknown>;
	/** The parsed JSON body (null for none) */
	body: unknown;
	/** false when the call failed validation and got a 400 */
	valid: boolean;
	/** Whether the reply was a stream (null when there was no reply) */
	streamed: boolean | null;
	/** The response rule that answered or failed the call, if any */
	rule: { id: string | null; match: string } | null;
	/** How llmock failed the call on purpose, or null if it did not */
	failed: (CallFailure & { by: 'rule' | 'chaos' }) | null;
	/**
	 * When recording: the upstream's status for a call that was sent on to
	 * it, and whether its reply was saved. null for a call that wasn't.
	 */
	forwarded: { status: number; saved: boolean } | null;
}

export interface RequestFilter {
	/** Case-sensitive text the body must contain, as a rule's `match` */
	match?: string;
	/** Where `match` is looked for, as a rule's `in` (default `any`) */
	in?: 'any' | 'last';
	/** Only calls to this route, e.g. `/v1/messages` */
	path?: string;
}

// The most calls kept; older ones are dropped
export const maxRecordedRequests = 500;

// Never shown: they may be a real key sent to the mock by mistake
const credentialHeaders = new Set([
	'authorization',
	'proxy-authorization',
	'x-api-key',
	'api-key',
	'x-goog-api-key',
	'cookie',
]);

// The same for the query string: Gemini clients send their key as ?key=
const credentialParams = new Set([
	'key',
	'api_key',
	'api-key',
	'apikey',
	'access_token',
]);

let recorded: RecordedRequest[] = [];

const redact = (values: object, credentials: ReadonlySet<string>) =>
	Object.fromEntries(
		Object.entries(values).map(([name, value]) => [
			name,
			credentials.has(name.toLowerCase()) ? '[redacted]' : value,
		]),
	);

/**
 * Records a call. The returned entry is the recorded one: the route fills in
 * `streamed`, `rule` and `failed` as it deals with the call.
 */
export const recordRequest = (
	request: FastifyRequest,
	valid = true,
): RecordedRequest => {
	const entry: RecordedRequest = {
		id: String(request.id),
		time: new Date().toISOString(),
		method: request.method,
		path: request.url.split('?')[0],
		query: redact(request.query ?? {}, credentialParams),
		headers: redact(request.headers, credentialHeaders),
		body: request.body ?? null,
		valid,
		streamed: null,
		rule: null,
		failed: null,
		forwarded: null,
	};
	recorded.push(entry);
	if (recorded.length > maxRecordedRequests) {
		recorded = recorded.slice(-maxRecordedRequests);
	}

	return entry;
};

// What a recorded entry says about the rule that matched a call
export const describeRule = (
	rule: ResponseRule & { id?: string },
): RecordedRequest['rule'] => ({ id: rule.id ?? null, match: rule.match });

/**
 * Checks a filter from a query string or a caller, throwing a TypeError that
 * says what is wrong with it
 */
export const validateRequestFilter = (filter: unknown): RequestFilter => {
	if (filter === undefined || filter === null) return {};
	if (typeof filter !== 'object' || Array.isArray(filter)) {
		throw new TypeError('filter must be an object');
	}

	const allowed = new Set(['match', 'in', 'path']);
	const unknown = Object.keys(filter).filter((key) => !allowed.has(key));
	if (unknown.length > 0) {
		throw new TypeError(`unknown filter: ${unknown.join(', ')}`);
	}

	const { match, in: scope, path } = filter as Record<string, unknown>;
	if (match !== undefined && (typeof match !== 'string' || match === '')) {
		throw new TypeError('match must be a non-empty string');
	}

	if (scope !== undefined && scope !== 'any' && scope !== 'last') {
		throw new TypeError('in must be "any" or "last"');
	}

	if (path !== undefined && typeof path !== 'string') {
		throw new TypeError('path must be a string');
	}

	return filter as RequestFilter;
};

const matches = (entry: RecordedRequest, filter: RequestFilter): boolean => {
	if (filter.path !== undefined) {
		const path = filter.path.startsWith('/')
			? filter.path
			: `/${filter.path}`;
		if (entry.path !== path) return false;
	}

	if (filter.match === undefined) return true;

	const strings =
		filter.in === 'last'
			? collectLastMessageStrings(entry.body)
			: collectStrings(entry.body);
	return strings.join('\n').includes(filter.match);
};

/**
 * The recorded calls, oldest first (the first call is `[0]`), that pass the
 * filter. Copies, so a caller can't change what is recorded.
 */
export const getRecordedRequests = (
	filter: RequestFilter = {},
): RecordedRequest[] =>
	structuredClone(recorded.filter((entry) => matches(entry, filter)));

export const getRecordedRequest = (id: string): RecordedRequest | undefined => {
	const entry = recorded.find((candidate) => candidate.id === id);
	return entry && structuredClone(entry);
};

export const clearRecordedRequests = (): void => {
	recorded = [];
};
