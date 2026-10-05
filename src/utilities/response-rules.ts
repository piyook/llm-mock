import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isStopReason, stopReasons, type StopReason } from './stop-reason.js';
import {
	chaosKinds,
	defaultChaosAfterChunks,
	defaultChaosStatus,
	type CallFailure,
} from './chaos.js';

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
 */
export interface ResponseRule {
	match: string;
	file?: string;
	files?: string[];
	stopReason?: StopReason;
	fail?: Partial<CallFailure>;
}

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
 * Returns the first rule (in config order) whose `match` appears in the
 * request body, or undefined. Matching is case-sensitive.
 */
export const findMatchingRule = (
	rules: ResponseRule[],
	body: unknown,
): ResponseRule | undefined => {
	if (rules.length === 0) return undefined;

	const text = collectStrings(body).join('\n');
	return rules.find((rule) => text.includes(rule.match));
};

/**
 * Every fixture file a rule can reply with: its `files`, or its single `file`.
 * Empty for a rule that only fails.
 */
export const ruleFiles = (rule: ResponseRule): string[] =>
	rule.files ?? (rule.file === undefined ? [] : [rule.file]);

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
 * Reply text for a matched rule: its fixture, or a random pick from `files`.
 */
export const loadRuleContent = (rule: ResponseRule, baseDir: string) => {
	const files = ruleFiles(rule);
	const file = files[Math.floor(Math.random() * files.length)];

	return readRuleFile(rule, file, baseDir);
};

// Checks a rule's `fail`: each setting is optional, and held to the same
// limits as its chaos counterpart
const validateRuleFail = (fail: unknown, index: number): void => {
	if (typeof fail !== 'object' || fail === null || Array.isArray(fail)) {
		throw new TypeError(`responseRules[${index}].fail must be an object`);
	}

	const { kind, status, afterChunks } = fail as Record<string, unknown>;

	if (kind !== undefined && !chaosKinds.includes(kind as never)) {
		throw new TypeError(
			`responseRules[${index}].fail.kind must be one of: ${chaosKinds.join(', ')}`,
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
			`responseRules[${index}].fail.status must be an integer from 400 to 599`,
		);
	}

	if (
		afterChunks !== undefined &&
		!(Number.isInteger(afterChunks) && Number(afterChunks) >= 0)
	) {
		throw new TypeError(
			`responseRules[${index}].fail.afterChunks must be an integer of 0 or more`,
		);
	}
};

/**
 * Checks the shape of configured rules; an empty `match` would match every
 * request, so it is rejected.
 */
export const validateResponseRules = (rules: unknown): ResponseRule[] => {
	if (rules === undefined) return [];

	if (!Array.isArray(rules)) {
		throw new TypeError('responseRules must be an array');
	}

	for (const [index, rule] of rules.entries()) {
		const { match, file, files, stopReason, fail } = (rule ??
			{}) as Partial<ResponseRule>;
		if (typeof match !== 'string' || match === '') {
			throw new TypeError(
				`responseRules[${index}].match must be a non-empty string`,
			);
		}

		if (stopReason !== undefined && !isStopReason(stopReason)) {
			throw new TypeError(
				`responseRules[${index}].stopReason must be one of: ${stopReasons.join(', ')}`,
			);
		}

		if (fail !== undefined) validateRuleFail(fail, index);

		if (files !== undefined) {
			if (file !== undefined) {
				throw new TypeError(
					`responseRules[${index}] must have either file or files, not both`,
				);
			}

			if (
				!Array.isArray(files) ||
				files.length === 0 ||
				files.some((entry) => typeof entry !== 'string' || entry === '')
			) {
				throw new TypeError(
					`responseRules[${index}].files must be a non-empty array of non-empty strings`,
				);
			}

			continue;
		}

		// A rule that fails can do without a fixture
		if (fail !== undefined && file === undefined) continue;

		if (typeof file !== 'string' || file === '') {
			throw new TypeError(
				`responseRules[${index}].file must be a non-empty string`,
			);
		}
	}

	return rules as ResponseRule[];
};
