import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * `storedResponsesFile` replaces the bundled texts used by
 * `responseType: "stored"` with a project's own pool. Configured per model
 * preset:
 *
 *   "storedResponsesFile": "fixtures/replies.json"
 *
 * The path is resolved relative to the folder holding the config file. The
 * file is a JSON array whose entries are strings or `{ "content": "..." }`
 * objects (the shape of the bundled data, extra keys such as `id` are ignored).
 */

/**
 * Checks the configured path; undefined means the bundled texts are used.
 */
export const validateStoredResponsesFile = (
	file: unknown,
): string | undefined => {
	if (file === undefined) return undefined;

	if (typeof file !== 'string' || file === '') {
		throw new TypeError('storedResponsesFile must be a non-empty string');
	}

	return file;
};

/**
 * Turns parsed file contents into the list of reply texts, rejecting anything
 * that isn't a non-empty array of strings or `{ content }` objects.
 */
export const parseStoredResponses = (data: unknown): string[] => {
	if (!Array.isArray(data)) {
		throw new TypeError('must contain a JSON array');
	}

	if (data.length === 0) {
		throw new TypeError('must contain at least one response');
	}

	return data.map((entry: unknown, index) => {
		if (typeof entry === 'string') return entry;

		const content = (entry as { content?: unknown } | null)?.content;
		if (typeof content === 'string') return content;

		throw new TypeError(
			`entry [${index}] must be a string or an object with a string "content"`,
		);
	});
};

/**
 * Reads the pool of stored replies. Fails loudly rather than falling back to
 * the bundled texts, so a wrong path or a broken file is noticed.
 */
export const loadStoredResponses = (file: string, baseDir: string) => {
	const path = resolve(baseDir, file);
	let raw: string;

	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		throw new Error(
			`storedResponsesFile: file not found or unreadable: ${path}`,
		);
	}

	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`storedResponsesFile: ${path} is not valid JSON: ${(error as Error).message}`,
		);
	}

	try {
		return parseStoredResponses(data);
	} catch (error) {
		throw new Error(
			`storedResponsesFile: ${path} ${(error as Error).message}`,
		);
	}
};
