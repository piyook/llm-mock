import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * A response rule returns the contents of `file` instead of generated text
 * when the request contains `match`. Configured per model preset:
 *
 *   "responseRules": [{ "match": "some text", "file": "fixtures/reply.json" }]
 *
 * `file` is resolved relative to the folder holding the config file.
 */
export interface ResponseRule {
	match: string;
	file: string;
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
 * Reads a rule's fixture exactly as written (a trailing newline in the file
 * is sent too). Fails loudly rather than falling back to lorem, so a wrong
 * path is noticed.
 */
export const loadRuleContent = (rule: ResponseRule, baseDir: string) => {
	const path = resolve(baseDir, rule.file);

	try {
		return readFileSync(path, 'utf8');
	} catch {
		throw new Error(
			`responseRules: fixture file not found or unreadable: ${path} (rule match: "${rule.match}")`,
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
		const { match, file } = (rule ?? {}) as Partial<ResponseRule>;
		if (typeof match !== 'string' || match === '') {
			throw new TypeError(
				`responseRules[${index}].match must be a non-empty string`,
			);
		}

		if (typeof file !== 'string' || file === '') {
			throw new TypeError(
				`responseRules[${index}].file must be a non-empty string`,
			);
		}
	}

	return rules as ResponseRule[];
};
