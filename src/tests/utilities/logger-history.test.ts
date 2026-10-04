import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Point the log folder at a temp directory so the real log is left alone
const logDir = await vi.hoisted(async () => {
	const { mkdtempSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	return mkdtempSync(join(tmpdir(), 'llmock-logger-'));
});

vi.mock('env-paths', () => ({ default: () => ({ log: logDir }) }));

const {
	default: logger,
	logPath,
	clearLog,
	maxLogEntries,
	defaultLogEntries,
	logEntriesLimit,
} = await import('../../utilities/logger.js');

describe('request log history', () => {
	const previous = process.env.LOG_REQUESTS;
	const previousMax = process.env.MAX_LOGGED_REQUESTS;

	const log = (id: number, state = 'PASSED') => {
		logger({ id } as any, state, 'a reason', 'some information');
	};

	const readLog = () => JSON.parse(readFileSync(logPath, 'utf8'));

	beforeEach(() => {
		process.env.LOG_REQUESTS = 'ON';
		delete process.env.MAX_LOGGED_REQUESTS;
		rmSync(logPath, { force: true });
	});

	afterAll(() => {
		rmSync(logDir, { recursive: true, force: true });
		if (previous === undefined) delete process.env.LOG_REQUESTS;
		else process.env.LOG_REQUESTS = previous;
		if (previousMax === undefined) delete process.env.MAX_LOGGED_REQUESTS;
		else process.env.MAX_LOGGED_REQUESTS = previousMax;
	});

	test('keeps each request, newest first', () => {
		log(1);
		log(2, 'FAILED');

		const entries = readLog();

		expect(entries).toHaveLength(2);
		expect(entries[0].sent_POST_request).toEqual({ id: 2 });
		expect(entries[0].request_validation).toMatchObject({
			validation_status: 'FAILED',
			reason: 'a reason',
			information: 'some information',
		});
		expect(entries[1].sent_POST_request).toEqual({ id: 1 });
	});

	test('drops the oldest requests beyond the default of 10', () => {
		for (let id = 1; id <= 13; id++) log(id);

		const ids = readLog().map(
			(entry: { sent_POST_request: { id: number } }) =>
				entry.sent_POST_request.id,
		);

		expect(ids).toHaveLength(10);
		expect(ids[0]).toBe(13);
		expect(ids.at(-1)).toBe(4);
	});

	test('keeps as many requests as maxLoggedRequests sets', () => {
		process.env.MAX_LOGGED_REQUESTS = '3';

		for (let id = 1; id <= 5; id++) log(id);

		expect(readLog()).toHaveLength(3);
	});

	test.each([
		['25', 25],
		['1', 1],
		['2.9', 2],
		['100', logEntriesLimit],
		['5000', logEntriesLimit],
		['0', defaultLogEntries],
		['-4', defaultLogEntries],
		['lots', defaultLogEntries],
		['', defaultLogEntries],
	])('a maxLoggedRequests of "%s" keeps %i', (setting, expected) => {
		process.env.MAX_LOGGED_REQUESTS = setting;

		expect(maxLogEntries()).toBe(expected);
	});

	test('keeps text that needs escaping intact', () => {
		logger(
			{ text: 'line one\nline "two"' } as any,
			'FAILED',
			'a "quoted" reason',
		);

		const [entry] = readLog();

		expect(entry.sent_POST_request.text).toBe('line one\nline "two"');
		expect(entry.request_validation.reason).toBe('a "quoted" reason');
	});

	test('starts again from a log file that cannot be read', () => {
		writeFileSync(logPath, 'not json');

		log(1);

		expect(readLog()).toHaveLength(1);
	});

	test('clearLog empties the log, and is fine with none to clear', () => {
		log(1);

		clearLog();
		clearLog();

		expect(() => readLog()).toThrow();
	});

	test('writes nothing when logging is off', () => {
		process.env.LOG_REQUESTS = 'OFF';

		log(1);

		expect(() => readLog()).toThrow();
	});
});
