import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isStopReason, stopReasons, type StopReason } from './stop-reason.js';
import {
	chaosKinds,
	defaultChaosAfterChunks,
	defaultChaosStatus,
	type CallFailure,
} from './chaos.js';
import {
	toReplyBlocks,
	validateRuleContent,
	type ReplyContentBlock,
	type RuleContentBlock,
} from './tool-use.js';

/**
 * A response rule returns the contents of `file` instead of generated text
 * when the request contains `match`. Configured per model preset:
 *
 *   "responseRules": [{ "match": "some text", "file": "fixtures/reply.json" }]
 *
 * A rule can instead list several `files`; one is picked at random on each
 * matching request:
 *
 *   "responseRules": [{ "match": "some text", "files": ["a.txt", "b.txt"] }]
 *
 * Paths are resolved relative to the folder holding the config file. A rule
 * has either `file` or `files`, never both.
 *
 * A rule can hold its reply itself, as `text`, in place of a file:
 *
 *   "responseRules": [{ "match": "some text", "text": "the reply" }]
 *
 * `stopReason` sets how the reply ends (see stop-reason.ts); the reply text is
 * still the fixture exactly as written.
 *
 * `fail` makes every matching request fail instead, the way chaos fails a
 * call (see chaos.ts), whether or not chaos is on:
 *
 *   "responseRules": [{ "match": "some text", "fail": { "kind": "stream-drop" } }]
 *
 * A rule with `fail` needs no fixture. Without one, a stream that fails
 * part-way through sends the start of a generated reply.
 *
 * For the claude format a rule can answer with tool calls: `content` holds
 * the blocks (see tool-use.ts), or `contentFile` names a JSON file holding
 * them. Such a reply ends with stop_reason "tool_use".
 */
export interface ResponseRule {
	match: string;
	text?: string;
	file?: string;
	files?: string[];
	content?: RuleContentBlock[];
	contentFile?: string;
	stopReason?: StopReason | 'tool_use';
	fail?: Partial<CallFailure>;
	in?: RuleScope;
}

/**
 * Where a rule's `match` is looked for: `any` string value in the request
 * body (the default), or only the `last` message's content. In a tool loop
 * the earlier turns, and the tools, are sent again on every step, so a rule
 * keyed on the latest tool result needs `last`.
 */
const ruleScopes = ['any', 'last'] as const;

export type RuleScope = (typeof ruleScopes)[number];

// The keys that hold a rule's reply; a rule has at most one of them
const replyKeys = ['text', 'file', 'files', 'content', 'contentFile'] as const;

// Whether a rule answers with tool calls
export const ruleHasToolCalls = (rule: ResponseRule): boolean =>
	rule.content !== undefined || rule.contentFile !== undefined;

/**
 * Collects every string value in a request body (message text, system text,
 * content blocks...), ignoring keys and non-strings. Matching against these
 * rather than the serialized JSON means quotes and newlines in `match` work.
 */
export const collectStrings = (value: unknown): string[] => {
	if (typeof value === 'string') return [value];

	if (Array.isArray(value)) return value.flatMap(collectStrings);

	if (typeof value === 'object' && value !== null) {
		return Object.values(value).flatMap(collectStrings);
	}

	return [];
};

/**
 * The string values of the last message: the last entry of `messages` (its
 * content, as a string or blocks, tool_result content included), or for
 * Gemini the last entry of `contents` (its parts). Its role is left out.
 * Empty if the body has neither.
 */
export const collectLastMessageStrings = (body: unknown): string[] => {
	if (typeof body !== 'object' || body === null) return [];

	const { messages, contents } = body as {
		messages?: unknown;
		contents?: unknown;
	};
	const [list, key] = Array.isArray(messages)
		? [messages, 'content']
		: [contents, 'parts'];
	if (!Array.isArray(list) || list.length === 0) return [];

	const last: unknown = list.at(-1);
	return typeof last === 'object' && last !== null
		? collectStrings((last as Record<string, unknown>)[key])
		: [];
};

/**
 * Returns the first rule (in config order) whose `match` appears in the
 * request body, or undefined. Matching is case-sensitive. A rule with
 * `in: "last"` is matched against the last message only.
 */
export const findMatchingRule = (
	rules: ResponseRule[],
	body: unknown,
): ResponseRule | undefined => {
	if (rules.length === 0) return undefined;

	// Each is worked out once, and only if a rule needs it
	const texts: Partial<Record<RuleScope, string>> = {};
	const textIn = (scope: RuleScope) =>
		(texts[scope] ??= (
			scope === 'last'
				? collectLastMessageStrings(body)
				: collectStrings(body)
		).join('\n'));

	return rules.find((rule) => textIn(rule.in ?? 'any').includes(rule.match));
};

/**
 * Every fixture file a rule can reply with: its `files`, its single `file`,
 * or its `contentFile`. Empty for a rule with no file.
 */
export const ruleFiles = (rule: ResponseRule): string[] =>
	rule.files ??
	(rule.file === undefined
		? rule.contentFile === undefined
			? []
			: [rule.contentFile]
		: [rule.file]);

// Whether a rule has a reply of its own: text, content or a fixture
export const ruleHasReply = (rule: ResponseRule): boolean =>
	rule.text !== undefined ||
	rule.content !== undefined ||
	ruleFiles(rule).length > 0;

/**
 * How a rule's matching requests fail, with the defaults filled in, or
 * undefined for a rule that replies.
 */
export const ruleFailure = (rule: ResponseRule): CallFailure | undefined =>
	rule.fail && {
		kind: rule.fail.kind ?? 'http',
		status: rule.fail.status ?? defaultChaosStatus,
		afterChunks: rule.fail.afterChunks ?? defaultChaosAfterChunks,
	};

/**
 * Reads one of a rule's fixtures exactly as written (a trailing newline in
 * the file is sent too). Fails loudly rather than falling back to lorem, so a
 * wrong path is noticed.
 */
export const readRuleFile = (
	rule: ResponseRule,
	file: string,
	baseDir: string,
) => {
	const path = resolve(baseDir, file);

	try {
		return readFileSync(path, 'utf8');
	} catch {
		throw new Error(
			`responseRules: fixture file not found or unreadable: ${path} (rule match: "${rule.match}")`,
		);
	}
};

/**
 * The content blocks of a rule with `content` or `contentFile`, checked. A
 * contentFile is re-read on each request, like any fixture; one that has
 * become invalid fails the request rather than falling back.
 */
export const readRuleContent = (
	rule: ResponseRule,
	baseDir: string,
): RuleContentBlock[] => {
	if (rule.content !== undefined) return rule.content;

	const file = rule.contentFile ?? '';
	const raw = readRuleFile(rule, file, baseDir);
	let content: unknown;
	try {
		content = JSON.parse(raw);
	} catch {
		throw new Error(
			`responseRules: contentFile is not valid JSON: ${resolve(baseDir, file)} (rule match: "${rule.match}")`,
		);
	}

	try {
		validateRuleContent(content, `contentFile ${file}`);
	} catch (error) {
		throw new Error(
			`responseRules: ${(error as Error).message} (rule match: "${rule.match}")`,
		);
	}

	return content as RuleContentBlock[];
};

/**
 * The blocks one reply of a tool-call rule sends, with new ids where the rule
 * gives none.
 */
export const loadRuleBlocks = (
	rule: ResponseRule,
	baseDir: string,
): ReplyContentBlock[] => toReplyBlocks(readRuleContent(rule, baseDir));

/**
 * Reply text for a matched rule: its `text`, its fixture, or a random pick
 * from `files`.
 */
export const loadRuleContent = (rule: ResponseRule, baseDir: string) => {
	if (rule.text !== undefined) return rule.text;

	const files = ruleFiles(rule);
	const file = files[Math.floor(Math.random() * files.length)];

	return readRuleFile(rule, file, baseDir);
};

// Checks a rule's `fail`: each setting is optional, and held to the same
// limits as its chaos counterpart
const validateRuleFail = (fail: unknown, label: string): void => {
	if (typeof fail !== 'object' || fail === null || Array.isArray(fail)) {
		throw new TypeError(`${label}.fail must be an object`);
	}

	const { kind, status, afterChunks } = fail as Record<string, unknown>;

	if (kind !== undefined && !chaosKinds.includes(kind as never)) {
		throw new TypeError(
			`${label}.fail.kind must be one of: ${chaosKinds.join(', ')}`,
		);
	}

	if (
		status !== undefined &&
		!(
			Number.isInteger(status) &&
			Number(status) >= 400 &&
			Number(status) <= 599
		)
	) {
		throw new TypeError(
			`${label}.fail.status must be an integer from 400 to 599`,
		);
	}

	if (
		afterChunks !== undefined &&
		!(Number.isInteger(afterChunks) && Number(afterChunks) >= 0)
	) {
		throw new TypeError(
			`${label}.fail.afterChunks must be an integer of 0 or more`,
		);
	}
};

// Checks a rule that answers with tool calls: claude format only, one source
// of blocks and no other reply, and a stop reason of tool_use if any
const validateToolCallRule = (
	rule: Partial<ResponseRule>,
	label: string,
	format: string | undefined,
): void => {
	if (format !== undefined && format !== 'claude') {
		throw new TypeError(
			`${label}: content and contentFile are only for the claude format (this preset is "${format}")`,
		);
	}

	const given = replyKeys.filter((key) => rule[key] !== undefined);
	if (given.length > 1) {
		throw new TypeError(
			`${label} must have only one of ${replyKeys.join(', ')} (has ${given.join(', ')})`,
		);
	}

	if (rule.stopReason !== undefined && rule.stopReason !== 'tool_use') {
		throw new TypeError(
			`${label}.stopReason must be "tool_use" or left out on a rule with content`,
		);
	}

	if (rule.content !== undefined) {
		validateRuleContent(rule.content, `${label}.content`);
		return;
	}

	if (typeof rule.contentFile !== 'string' || rule.contentFile === '') {
		throw new TypeError(`${label}.contentFile must be a non-empty string`);
	}
};

/**
 * Checks the shape of one rule. `label` names the rule in the error, e.g.
 * `responseRules[2]`. An empty `match` would match every request, so it is
 * rejected.
 */
export const validateResponseRule = (
	rule: unknown,
	label: string,
	format?: string,
): void => {
	const { match, text, file, files, content, contentFile, stopReason, fail } =
		(rule ?? {}) as Partial<ResponseRule>;
	if (typeof match !== 'string' || match === '') {
		throw new TypeError(`${label}.match must be a non-empty string`);
	}

	if (
		stopReason !== undefined &&
		!isStopReason(stopReason) &&
		stopReason !== 'tool_use'
	) {
		throw new TypeError(
			`${label}.stopReason must be one of: ${[...stopReasons, 'tool_use'].join(', ')}`,
		);
	}

	if (fail !== undefined) validateRuleFail(fail, label);

	const scope = (rule as Partial<ResponseRule>).in;
	if (scope !== undefined && !ruleScopes.includes(scope)) {
		throw new TypeError(
			`${label}.in must be one of: ${ruleScopes.join(', ')}`,
		);
	}

	if (content !== undefined || contentFile !== undefined) {
		validateToolCallRule(rule as Partial<ResponseRule>, label, format);
		return;
	}

	if (stopReason === 'tool_use') {
		throw new TypeError(
			`${label}.stopReason "tool_use" needs content or contentFile with a tool_use block`,
		);
	}

	if (text !== undefined) {
		if (typeof text !== 'string') {
			throw new TypeError(`${label}.text must be a string`);
		}

		if (file !== undefined || files !== undefined) {
			throw new TypeError(
				`${label} must have only one of text, file or files`,
			);
		}

		return;
	}

	if (files !== undefined) {
		if (file !== undefined) {
			throw new TypeError(
				`${label} must have either file or files, not both`,
			);
		}

		if (
			!Array.isArray(files) ||
			files.length === 0 ||
			files.some((entry) => typeof entry !== 'string' || entry === '')
		) {
			throw new TypeError(
				`${label}.files must be a non-empty array of non-empty strings`,
			);
		}

		return;
	}

	// A rule that fails can do without a reply of its own
	if (fail !== undefined && file === undefined) return;

	if (typeof file !== 'string' || file === '') {
		throw new TypeError(`${label}.file must be a non-empty string`);
	}
};

// Checks the shape of configured rules. `format` is the preset's `name`:
// tool-call rules are refused for any format but claude
export const validateResponseRules = (
	rules: unknown,
	format?: string,
): ResponseRule[] => {
	if (rules === undefined) return [];

	if (!Array.isArray(rules)) {
		throw new TypeError('responseRules must be an array');
	}

	for (const [index, rule] of rules.entries()) {
		validateResponseRule(rule, `responseRules[${index}]`, format);
	}

	return rules as ResponseRule[];
};
