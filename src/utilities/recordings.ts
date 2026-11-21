/* eslint-disable @typescript-eslint/naming-convention */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FastifyRequest } from 'fastify';
import { getConfigDir, getRulesFormat } from '../config/config-loader.js';
import {
	collectLastMessageStrings,
	validateResponseRules,
	type ResponseRule,
} from './response-rules.js';
import { toReplyBlocks, type RuleContentBlock } from './tool-use.js';
import type { StopReason } from './stop-reason.js';
import type { MockReply } from '../types.js';

/**
 * Record and replay. With an upstream set (`recordings.upstream` in the
 * preset, or --record), a chat call that no rule answers is sent on to the
 * real provider, and its reply is saved as a fixture file plus a response
 * rule in `<recordings dir>/rules.json`. The rule is matched from then on, so
 * the same call is answered from the recording, also after a restart and
 * with no upstream (replay only).
 *
 * A recorded rule matches the whole text of the call's last message, with
 * `in: "last"` and `exact: true` (ids such as a tool_result's tool_use_id are
 * left out, as replayed tool calls get new ones). The client gets llmock's own reply built from the recorded
 * text, streamed if it asked for a stream (the provider is always asked for
 * a whole reply), so the first call and every replay look the same.
 */
export const defaultRecordingsDir = 'recordings';
export const recordingsRulesFile = 'rules.json';

// Never sent on: they describe this connection, not the call
const hopHeaders = new Set([
	'host',
	'connection',
	'content-length',
	'transfer-encoding',
	'accept-encoding',
	'keep-alive',
	'upgrade',
]);

/** The provider calls are sent on to, or undefined for replay only */
export const recordUpstream = (): string | undefined => {
	const upstream = process.env?.RECORD_UPSTREAM?.trim();
	return upstream ? upstream.replace(/\/+$/, '') : undefined;
};

/**
 * The recordings folder, absolute, or undefined when there is none: the
 * preset's `recordings.dir` (or --recordings), else `recordings` when an
 * upstream is set
 */
export const recordingsDir = (): string | undefined => {
	const dir =
		process.env?.RECORDINGS_DIR?.trim() ||
		(recordUpstream() ? defaultRecordingsDir : '');
	return dir ? resolve(getConfigDir(), dir) : undefined;
};

// Calls sent on to the upstream since the server started, and how many of
// their replies were saved
const forwardCounts = { forwarded: 0, saved: 0 };

// While paused, a call no rule answers gets a mock reply and nothing is sent
// on; the recorded rules still answer. Set through the admin API, and undone
// by a reset or a restart.
let paused = false;

/** Whether calls no rule answers are sent on to the upstream right now */
export const isRecording = (): boolean =>
	recordUpstream() !== undefined && !paused;

/**
 * Pauses or resumes recording, from a `{ paused: boolean }` change, throwing
 * an Error that says why it can't be made
 */
export const changeRecording = (change: unknown): void => {
	if (
		typeof change !== 'object' ||
		change === null ||
		Array.isArray(change) ||
		Object.keys(change).some((key) => key !== 'paused') ||
		typeof (change as { paused?: unknown }).paused !== 'boolean'
	) {
		throw new Error('recording takes { "paused": true | false }');
	}

	const { paused: pause } = change as { paused: boolean };
	if (pause && recordUpstream() === undefined) {
		throw new Error(
			'Nothing to pause: this server is not recording (no recordings.upstream)',
		);
	}

	paused = pause;
};

/** Back to recording, if the server records: for a reset or a new server */
export const resumeRecording = (): void => {
	paused = false;
};

/** Counts one call sent on to the upstream */
export const countForwarded = (saved: boolean): void => {
	forwardCounts.forwarded += 1;
	if (saved) forwardCounts.saved += 1;
};

// The upstream as it can be shown: a user name or password in the URL is
// left out
const shownUpstream = (upstream: string): string => {
	try {
		const url = new URL(upstream);
		if (!url.username && !url.password) return upstream;
		url.username = '';
		url.password = '';
		return url.href.replace(/\/+$/, '');
	} catch {
		return upstream;
	}
};

/**
 * Whether the server records, only replays or neither, for the dashboard:
 * `record` sends the calls no rule answers to `upstream` and saves the
 * replies in `dir`, `replay` answers from `dir` only. `dir` is relative to
 * the config folder when it is inside it. `paused` is true while recording
 * is paused through the admin API: nothing is sent on until it is resumed.
 */
export const describeRecording = () => {
	const upstream = recordUpstream();
	const dir = recordingsDir();

	return {
		mode: upstream ? 'record' : dir ? 'replay' : 'off',
		paused: upstream !== undefined && paused,
		upstream: upstream ? shownUpstream(upstream) : null,
		dir: dir ? ruleFilePath(dir) : null,
		...forwardCounts,
	} as const;
};

/**
 * Checks the recording settings when the server starts, throwing an Error
 * that says what is wrong
 */
export const checkRecordingSettings = (): void => {
	const upstream = recordUpstream();
	if (upstream !== undefined) {
		let url: URL;
		try {
			url = new URL(upstream);
		} catch {
			throw new Error(
				`recordings.upstream must be an http or https URL, not "${upstream}"`,
			);
		}

		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new Error(
				`recordings.upstream must be an http or https URL, not "${upstream}"`,
			);
		}
	}

	// A rules file that can't be used stops the server, as a bad config would
	getRecordedRules();
};

/**
 * The recorded rules, in the order they were recorded. Re-read on every
 * request, like fixture files, so a hand-edited file is picked up. Their
 * files resolve against the config folder, like the config file's rules.
 */
export const getRecordedRules = (): ResponseRule[] => {
	const dir = recordingsDir();
	if (!dir) return [];

	const path = join(dir, recordingsRulesFile);
	if (!existsSync(path)) return [];

	let rules: unknown;
	try {
		rules = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		throw new Error(
			`recordings: ${path} is not valid JSON: ${(error as Error).message}`,
		);
	}

	try {
		return validateResponseRules(rules, getRulesFormat());
	} catch (error) {
		throw new Error(`recordings: ${path}: ${(error as Error).message}`);
	}
};

// What a provider's reply holds, ready to become a rule
type Extracted =
	{ text: string; stopReason?: StopReason } | { content: RuleContentBlock[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const stopIf = (
	value: unknown,
	maxTokens: string,
	refusal: string,
): StopReason | undefined =>
	value === maxTokens
		? 'max_tokens'
		: value === refusal
			? 'refusal'
			: undefined;

const withStop = (text: string, stopReason: StopReason | undefined) =>
	stopReason ? { text, stopReason } : { text };

/**
 * The reply in a provider's response body, in the wire format of the route
 * the call came to, or a string saying why it can't be recorded
 */
export const extractReply = (
	format: string | undefined,
	response: unknown,
): Extracted | string => {
	if (!isObject(response)) return 'the reply is not a JSON object';

	if (format === 'claude') {
		if (!Array.isArray(response.content)) return 'the reply has no content';
		const blocks = response.content.filter(isObject);
		const text = blocks
			.filter((block) => block.type === 'text')
			.map((block) => String(block.text ?? ''))
			.join('');
		const tools = blocks.filter((block) => block.type === 'tool_use');

		if (tools.length > 0) {
			// One leading text block, then the calls; new ids on every replay
			return {
				content: [
					...(text ? [{ type: 'text' as const, text }] : []),
					...tools.map((block) => ({
						type: 'tool_use' as const,
						name: String(block.name),
						input: isObject(block.input) ? block.input : {},
					})),
				],
			};
		}

		return withStop(
			text,
			stopIf(response.stop_reason, 'max_tokens', 'refusal'),
		);
	}

	if (format === 'openai') {
		const [choice] = Array.isArray(response.choices)
			? response.choices
			: [];
		if (!isObject(choice) || !isObject(choice.message)) {
			return 'the reply has no choices[0].message';
		}

		const { message } = choice;
		if (
			Array.isArray(message.tool_calls) &&
			message.tool_calls.length > 0
		) {
			return 'OpenAI tool calls are not recorded';
		}

		if (typeof message.refusal === 'string' && message.refusal) {
			return { text: message.refusal, stopReason: 'refusal' };
		}

		return withStop(
			typeof message.content === 'string' ? message.content : '',
			stopIf(choice.finish_reason, 'length', 'content_filter'),
		);
	}

	if (format === 'responses') {
		if (!Array.isArray(response.output)) return 'the reply has no output';
		const items = response.output.filter(isObject);
		if (items.some((item) => item.type === 'function_call')) {
			return 'Responses API function calls are not recorded';
		}

		const parts = items
			.filter((item) => item.type === 'message')
			.flatMap((item) =>
				Array.isArray(item.content) ? item.content : [],
			)
			.filter(isObject);
		const refusal = parts.find((part) => part.type === 'refusal');
		if (refusal) {
			return {
				text: String(refusal.refusal ?? ''),
				stopReason: 'refusal',
			};
		}

		return withStop(
			parts
				.filter((part) => part.type === 'output_text')
				.map((part) => String(part.text ?? ''))
				.join(''),
			response.status === 'incomplete' ? 'max_tokens' : undefined,
		);
	}

	if (format === 'gemini') {
		const [candidate] = Array.isArray(response.candidates)
			? response.candidates
			: [];
		if (!isObject(candidate)) return 'the reply has no candidates';
		const parts =
			isObject(candidate.content) &&
			Array.isArray(candidate.content.parts)
				? candidate.content.parts.filter(isObject)
				: [];

		return withStop(
			parts.map((part) => String(part.text ?? '')).join(''),
			stopIf(candidate.finishReason, 'MAX_TOKENS', 'SAFETY'),
		);
	}

	return `replies in the "${format}" format are not recorded`;
};

// A short, file-name-safe form of the text a rule matches
const slug = (text: string): string =>
	text
		.toLowerCase()
		.replaceAll(/[^a-z\d]+/g, '-')
		.replaceAll(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/, '') || 'call';

// A path for a rule: relative to the config folder, with forward slashes
const ruleFilePath = (path: string): string => {
	const fromConfig = relative(getConfigDir(), path);
	return (isAbsolute(fromConfig) ? path : fromConfig).split(sep).join('/');
};

/**
 * Saves a reply as a fixture file and a rule matching `match` in the last
 * message. Returns the rule.
 */
export const saveRecording = (
	match: string,
	reply: Extracted,
): ResponseRule => {
	const dir =
		recordingsDir() ?? resolve(getConfigDir(), defaultRecordingsDir);
	mkdirSync(dir, { recursive: true });

	const rules = getRecordedRules();
	const number = String(rules.length + 1).padStart(4, '0');
	const base = `${number}-${slug(match)}`;

	let rule: ResponseRule;
	if ('content' in reply) {
		const path = join(dir, `${base}.json`);
		writeFileSync(path, `${JSON.stringify(reply.content, null, 2)}\n`);
		rule = {
			match,
			in: 'last',
			exact: true,
			contentFile: ruleFilePath(path),
		};
	} else {
		const path = join(dir, `${base}.txt`);
		writeFileSync(path, reply.text);
		rule = {
			match,
			in: 'last',
			exact: true,
			file: ruleFilePath(path),
			...(reply.stopReason && { stopReason: reply.stopReason }),
		};
	}

	writeFileSync(
		join(dir, recordingsRulesFile),
		`${JSON.stringify([...rules, rule], null, 2)}\n`,
	);

	return rule;
};

/** A provider's answer sent back to the client as it came */
export interface Passthrough {
	status: number;
	contentType: string | undefined;
	body: string;
}

export type RecordOutcome =
	| { reply: MockReply; status: number; saved: true }
	| { passthrough: Passthrough; status: number; saved: false };

/**
 * Sends a call on to the upstream as a non-streamed request, then saves the
 * reply as a recording and returns it as a MockReply for the route to send in
 * its own format. An error status, a reply that can't be read, or a call
 * with no last-message text is sent back as it came and not saved.
 *
 * @param format - The route's wire format: openai, claude, gemini or responses
 */
export const forwardAndRecord = async (
	request: FastifyRequest,
	format: string | undefined,
): Promise<RecordOutcome> => {
	const upstream = recordUpstream() as string;
	const body = isObject(request.body) ? { ...request.body } : request.body;

	// The provider is asked for a whole reply: llmock streams it itself
	if (isObject(body)) {
		if (body.stream === true) body.stream = false;
		delete body.stream_options;
	}

	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (hopHeaders.has(name) || value === undefined) continue;
		headers.set(name, Array.isArray(value) ? value.join(', ') : value);
	}

	const response = await fetch(`${upstream}${request.url}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
	const text = await response.text();
	const passthrough = (reason?: string): RecordOutcome => {
		if (reason) console.warn(`RECORDING: not saved (${reason})`);
		return {
			passthrough: {
				status: response.status,
				contentType: response.headers.get('content-type') ?? undefined,
				body: text,
			},
			status: response.status,
			saved: false,
		};
	};

	if (!response.ok) {
		return passthrough(`the upstream answered ${response.status}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return passthrough('the reply is not JSON');
	}

	const extracted = extractReply(format, parsed);
	if (typeof extracted === 'string') return passthrough(extracted);

	const match = collectLastMessageStrings(request.body).join('\n');
	if (!match)
		return passthrough('the call has no last-message text to match');

	const rule = saveRecording(match, extracted);
	console.log(`RECORDING: saved ${rule.file ?? rule.contentFile}`);

	// As a rule with the same reply would answer
	const reply: MockReply =
		'content' in extracted
			? {
					text:
						extracted.content[0].type === 'text'
							? extracted.content[0].text
							: '',
					content: toReplyBlocks(extracted.content),
				}
			: withStop(extracted.text, extracted.stopReason);

	return { reply, status: response.status, saved: true };
};
