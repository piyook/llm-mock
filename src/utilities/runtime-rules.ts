import { getResponseRules } from '../config/config-loader.js';
import {
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
 */
export interface RuntimeRule extends ResponseRule {
	id: string;
}

const allowedKeys = new Set(['match', 'text', 'stopReason', 'fail']);

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

	const { match, text, stopReason, fail } = rule as ResponseRule;
	if (text === undefined && fail === undefined) {
		throw new TypeError('rule must have text or fail');
	}

	validateResponseRule(rule, 'rule');

	const added: RuntimeRule = {
		id: `r${nextId++}`,
		match,
		...(text !== undefined && { text }),
		...(stopReason !== undefined && { stopReason }),
		...(fail !== undefined && { fail }),
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
 * The active rules as the dashboard and the admin API report them: each with
 * where it came from, every file it can reply with, how its reply ends, and
 * how it fails (null if it replies).
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
		};
	});
