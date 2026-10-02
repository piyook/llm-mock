/* eslint-disable  @typescript-eslint/naming-convention */
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import { gptSeeder } from '../../seeders/gpt-seeder.js';
import serverPage from '../../utilities/server-page.js';

const require = createRequire(import.meta.url);
const bundled: string[] = require('../../data/data.json').map(
	(item: { content: string }) => item.content,
);

// What the dashboard is told about stored responses and response rules, and
// the routes it reads their contents from.
describe('dashboard routes for stored responses and response rules', () => {
	let dir: string;
	let app: FastifyInstance;
	const previous = {
		type: process.env.MOCK_LLM_RESPONSE_TYPE,
		model: process.env.LLM_MODEL_NAME,
	};

	const stored = ['first reply', 'second reply'];

	const preset = (extra: Record<string, unknown> = {}) => ({
		name: 'claude',
		model: 'claude-opus-5-5',
		endpoint: 'v1/messages',
		responseType: 'stored',
		maxLoremParas: 3,
		validateRequests: false,
		logRequests: false,
		debug: false,
		stream: false,
		responseDelay: { min: 0, max: 0 },
		embeddings: { enabled: false, dimensions: 128 },
		...extra,
	});

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-server-page-'));
		mkdirSync(join(dir, 'fixtures'));
		writeFileSync(
			join(dir, 'fixtures', 'stored.json'),
			JSON.stringify(stored),
		);
		writeFileSync(join(dir, 'fixtures', 'text.txt'), 'canned text\n');
		writeFileSync(join(dir, 'fixtures', 'pool-a.txt'), 'pool a');
		writeFileSync(join(dir, 'fixtures', 'pool-b.txt'), 'pool b');

		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'full',
				models: {
					full: preset({
						storedResponsesFile: 'fixtures/stored.json',
						responseRules: [
							{ match: 'WANT_TEXT', file: 'fixtures/text.txt' },
							{
								match: 'WANT_POOL',
								files: [
									'fixtures/pool-a.txt',
									'fixtures/pool-b.txt',
								],
							},
							{
								match: 'WANT_MISSING',
								file: 'fixtures/missing.txt',
							},
						],
					}),
					bare: preset(),
					broken: preset({
						storedResponsesFile: 'fixtures/missing.json',
					}),
				},
				server: { port: 8001, host: '0.0.0.0' },
			}),
		);

		loadConfig(configPath);
		gptSeeder();
		process.env.LLM_MODEL_NAME = 'full';
		process.env.MOCK_LLM_RESPONSE_TYPE = 'stored';

		app = fastify({ logger: false });
		serverPage(app, []);
	});

	afterAll(async () => {
		await app.close();
		rmSync(dir, { recursive: true, force: true });
		for (const [key, value] of [
			['MOCK_LLM_RESPONSE_TYPE', previous.type],
			['LLM_MODEL_NAME', previous.model],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	// Runs `run` with another preset active, then switches back
	const withPreset = async (name: string, run: () => Promise<void>) => {
		process.env.LLM_MODEL_NAME = name;
		try {
			await run();
		} finally {
			process.env.LLM_MODEL_NAME = 'full';
		}
	};

	const get = async (url: string) => {
		const response = await app.inject({ method: 'GET', url });
		return { status: response.statusCode, body: response.json() };
	};

	test('ui-meta reports the stored responses file and the rules', async () => {
		const { body } = await get('/ui-meta');

		expect(body.storedResponsesFile).toBe('fixtures/stored.json');
		expect(body.storedResponsesCount).toBe(stored.length);
		expect(body.responseRules).toEqual([
			{ match: 'WANT_TEXT', files: ['fixtures/text.txt'] },
			{
				match: 'WANT_POOL',
				files: ['fixtures/pool-a.txt', 'fixtures/pool-b.txt'],
			},
			{ match: 'WANT_MISSING', files: ['fixtures/missing.txt'] },
		]);
	});

	test('ui-meta reports no file and no rules when none are configured', async () => {
		await withPreset('bare', async () => {
			const { body } = await get('/ui-meta');

			expect(body.storedResponsesFile).toBeNull();
			expect(body.responseRules).toEqual([]);
		});
	});

	test('ui-meta reports no stored file when the response type is not stored', async () => {
		process.env.MOCK_LLM_RESPONSE_TYPE = 'lorem';
		try {
			const { body } = await get('/ui-meta');

			expect(body.storedResponsesFile).toBeNull();
			expect(body.responseRules).toHaveLength(3);
		} finally {
			process.env.MOCK_LLM_RESPONSE_TYPE = 'stored';
		}
	});

	test('ui-stored-responses returns the configured pool', async () => {
		const { status, body } = await get('/ui-stored-responses');

		expect(status).toBe(200);
		expect(body).toEqual({
			file: 'fixtures/stored.json',
			responses: stored,
		});
	});

	test('ui-stored-responses returns the bundled texts when no file is configured', async () => {
		await withPreset('bare', async () => {
			const { body } = await get('/ui-stored-responses');

			expect(body).toEqual({ file: null, responses: bundled });
		});
	});

	test('ui-stored-responses explains a file that cannot be used', async () => {
		await withPreset('broken', async () => {
			const { status, body } = await get('/ui-stored-responses');

			expect(status).toBe(500);
			expect(body.error).toMatch(
				/storedResponsesFile: file not found.*missing\.json/,
			);
		});
	});

	test('ui-rule-file returns a fixture exactly as written', async () => {
		const { status, body } = await get('/ui-rule-file?rule=0&file=0');

		expect(status).toBe(200);
		expect(body).toEqual({
			match: 'WANT_TEXT',
			file: 'fixtures/text.txt',
			content: 'canned text\n',
		});
	});

	test('ui-rule-file addresses each file of a pool', async () => {
		const { body } = await get('/ui-rule-file?rule=1&file=1');

		expect(body.file).toBe('fixtures/pool-b.txt');
		expect(body.content).toBe('pool b');
	});

	test('ui-rule-file explains a fixture that cannot be read', async () => {
		const { status, body } = await get('/ui-rule-file?rule=2&file=0');

		expect(status).toBe(500);
		expect(body.error).toMatch(/fixture file not found.*missing\.txt/);
	});

	test.each([
		'/ui-rule-file?rule=9&file=0',
		'/ui-rule-file?rule=0&file=9',
		'/ui-rule-file?rule=-1&file=0',
		'/ui-rule-file?rule=..%2Fsecret&file=0',
	])('ui-rule-file answers 404 for %s', async (url) => {
		const { status } = await get(url);

		expect(status).toBe(404);
	});
});
