import { getResponseRules } from '../config/config-loader.js';
import {
	findMatchingRule,
	ruleFailure,
	ruleFiles,
	validateResponseRule,
	type ResponseRule,
} from './response-rules.js';

/**
 * Response rules added while the server runs, through the admin API (see
 * admin-api.ts). They are held in memory only: the config file is never
 * written, and a restart starts again with none.
 *
 * A runtime rule holds its reply as `text`. It can't name a `file`: the admin
 * API is open to whoever can reach the server, and a path would let them read
 * files from this machine through a reply.
 *
 * `times` is how many more requests the rule answers. It goes down by one
 * with each request the rule matches, and the rule is removed after the last.
 * A rule without it stays until it is removed.
 */
export interface RuntimeRule extends ResponseRule {
	id: string;
	times?: number;
}

const allowedKeys = new Set(['match', 'text', 'stopReason', 'fail', 'times']);

let runtimeRules: RuntimeRule[] = [];
// Never reused, so an id that was removed can't come to mean another rule
let nextId = 1;

/**
 * Adds a rule, after the runtime rules already there. Throws a TypeError
 * describing the problem if it can't be used.
 */
export const addRuntimeRule = (rule: unknown): RuntimeRule => {
	if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
		throw new TypeError('rule must be a JSON object');
	}

	if ('file' in rule || 'files' in rule) {
		throw new TypeError(
			'rule can not use file or files: give the reply as text',
		);
	}

	const unknown = Object.keys(rule).filter((key) => !allowedKeys.has(key));
	if (unknown.length > 0) {
		throw new TypeError(`rule has unknown settings: ${unknown.join(', ')}`);
	}

	const { match, text, stopReason, fail, times } = rule as RuntimeRule;
	if (text === undefined && fail === undefined) {
		throw new TypeError('rule must have text or fail');
	}

	if (times !== undefined && !(Number.isInteger(times) && times >= 1)) {
		throw new TypeError('rule.times must be an integer of 1 or more');
	}

	validateResponseRule(rule, 'rule');

	const added: RuntimeRule = {
		id: `r${nextId++}`,
		match,
		...(text !== undefined && { text }),
		...(stopReason !== undefined && { stopReason }),
		...(fail !== undefined && { fail }),
		...(times !== undefined && { times }),
	};
	runtimeRules.push(added);

	return added;
};

// Removes one rule; false if there is none with that id
export const removeRuntimeRule = (id: string): boolean => {
	const remaining = runtimeRules.filter((rule) => rule.id !== id);
	const removed = remaining.length < runtimeRules.length;
	runtimeRules = remaining;

	return removed;
};

export const clearRuntimeRules = (): void => {
	runtimeRules = [];
};

/**
 * Every rule a request is matched against, in order (first match wins): the
 * runtime rules, then the active preset's own, plus the folder the preset's
 * files resolve against.
 */
export const getActiveRules = (): {
	rules: ResponseRule[];
	baseDir: string;
} => {
	const { rules, baseDir } = getResponseRules();

	return { rules: [...runtimeRules, ...rules], baseDir };
};

/**
 * The rule that answers this request, with the folder its files resolve
 * against, or undefined if none matches. This counts as one of the requests a
 * rule with `times` answers, so call it once per request.
 */
export const takeMatchingRule = (
	body: unknown,
): { rule: ResponseRule; baseDir: string } | undefined => {
	const { rules, baseDir } = getActiveRules();
	const rule = findMatchingRule(rules, body);
	if (!rule) return undefined;

	const runtime = runtimeRules.find((entry) => entry === rule);
	if (runtime?.times !== undefined) {
		runtime.times -= 1;
		if (runtime.times === 0) removeRuntimeRule(runtime.id);
	}

	return { rule, baseDir };
};

/**
 * The active rules as the dashboard and the admin API report them: each with
 * where it came from, every file it can reply with, how its reply ends, how
 * it fails (null if it replies), and how many more requests it answers (null
 * if it stays until removed).
 */
export const describeActiveRules = () =>
	getActiveRules().rules.map((rule) => {
		const runtime = runtimeRules.find((entry) => entry === rule);

		return {
			id: runtime?.id ?? null,
			source: runtime ? 'runtime' : 'config',
			match: rule.match,
			text: rule.text ?? null,
			files: ruleFiles(rule),
			stopReason: rule.stopReason ?? 'end',
			fail: ruleFailure(rule) ?? null,
			times: runtime?.times ?? null,
		};
	});
