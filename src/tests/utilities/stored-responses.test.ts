import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	loadStoredResponses,
	parseStoredResponses,
	validateStoredResponsesFile,
} from '../../utilities/stored-responses.js';

describe('validateStoredResponsesFile', () => {
	test('treats undefined as not configured', () => {
		expect(validateStoredResponsesFile(undefined)).toBeUndefined();
	});

	test('returns a valid path unchanged', () => {
		expect(validateStoredResponsesFile('fixtures/replies.json')).toBe(
			'fixtures/replies.json',
		);
	});

	test.each([
		['an empty string', ''],
		['a number', 3],
		['null', null],
		['an array', ['a.json']],
	])('rejects %s', (_name, value) => {
		expect(() => validateStoredResponsesFile(value)).toThrow(
			/storedResponsesFile must be a non-empty string/,
		);
	});
});

describe('parseStoredResponses', () => {
	test('accepts an array of strings', () => {
		expect(parseStoredResponses(['one', 'two'])).toEqual(['one', 'two']);
	});

	test('accepts the bundled { id, content } shape', () => {
		expect(
			parseStoredResponses([
				{ id: 1, content: 'one' },
				{ id: 2, content: 'two' },
			]),
		).toEqual(['one', 'two']);
	});

	test('accepts both shapes in one array', () => {
		expect(parseStoredResponses(['one', { content: 'two' }])).toEqual([
			'one',
			'two',
		]);
	});

	test.each([
		['an object', { responses: ['a'] }, /must contain a JSON array/],
		['a string', 'a', /must contain a JSON array/],
		['an empty array', [], /at least one response/],
		['a number entry', ['a', 3], /entry \[1\]/],
		['a null entry', [null], /entry \[0\]/],
		['an object without content', [{ id: 1 }], /entry \[0\]/],
		['non-string content', [{ content: 3 }], /entry \[0\]/],
	])('rejects %s', (_name, data, message) => {
		expect(() => parseStoredResponses(data)).toThrow(message);
	});
});

describe('loadStoredResponses', () => {
	let dir: string;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-stored-'));
		mkdirSync(join(dir, 'nested'));
		writeFileSync(join(dir, 'nested', 'replies.json'), '["one", "two"]');
		writeFileSync(join(dir, 'broken.json'), '["one", ');
		writeFileSync(join(dir, 'empty.json'), '[]');
		writeFileSync(join(dir, 'bad-entry.json'), '["one", 2]');
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('reads the file relative to the base dir', () => {
		expect(loadStoredResponses('nested/replies.json', dir)).toEqual([
			'one',
			'two',
		]);
	});

	test('throws a clear error naming the path when missing', () => {
		expect(() => loadStoredResponses('nope.json', dir)).toThrow(
			/storedResponsesFile: file not found or unreadable.*nope\.json/,
		);
	});

	test('throws when the path is a folder', () => {
		expect(() => loadStoredResponses('nested', dir)).toThrow(
			/storedResponsesFile: file not found or unreadable/,
		);
	});

	test('throws when the file is not valid JSON', () => {
		expect(() => loadStoredResponses('broken.json', dir)).toThrow(
			/storedResponsesFile: .*broken\.json is not valid JSON/,
		);
	});

	test('throws when the array is empty', () => {
		expect(() => loadStoredResponses('empty.json', dir)).toThrow(
			/storedResponsesFile: .*empty\.json must contain at least one response/,
		);
	});

	test('throws when an entry has the wrong shape', () => {
		expect(() => loadStoredResponses('bad-entry.json', dir)).toThrow(
			/storedResponsesFile: .*bad-entry\.json entry \[1\]/,
		);
	});
});
