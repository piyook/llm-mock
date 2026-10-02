/* eslint-disable  @typescript-eslint/naming-convention */
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Point the log folder at a temp directory so the real log is left alone
const logDir = await vi.hoisted(async () => {
	const { mkdtempSync } = await import('fs');
	const { tmpdir } = await import('os');
	const { join } = await import('path');
	return mkdtempSync(join(tmpdir(), 'llmock-logger-'));
});

vi.mock('env-paths', () => ({ default: () => ({ log: logDir }) }));

const {
	default: logger,
	logPath,
	maxLogEntries,
} = await import('../../utilities/logger.js');

describe('request log history', () => {
	const previous = process.env.LOG_REQUESTS;

	const log = (id: number, state = 'PASSED') => {
		logger({ id } as any, state, 'a reason', 'some information');
	};

	const readLog = () => JSON.parse(readFileSync(logPath, 'utf8'));

	beforeEach(() => {
		process.env.LOG_REQUESTS = 'ON';
		rmSync(logPath, { force: true });
	});

	afterAll(() => {
		rmSync(logDir, { recursive: true, force: true });
		if (previous === undefined) delete process.env.LOG_REQUESTS;
		else process.env.LOG_REQUESTS = previous;
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

	test('drops the oldest requests beyond the limit', () => {
		for (let id = 1; id <= maxLogEntries + 3; id++) log(id);

		const ids = readLog().map(
			(entry: { sent_POST_request: { id: number } }) =>
				entry.sent_POST_request.id,
		);

		expect(ids).toHaveLength(maxLogEntries);
		expect(ids[0]).toBe(maxLogEntries + 3);
		expect(ids.at(-1)).toBe(4);
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

	test('writes nothing when logging is off', () => {
		process.env.LOG_REQUESTS = 'OFF';

		log(1);

		expect(() => readLog()).toThrow();
	});
});
