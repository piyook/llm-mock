import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import { generateResponseContent } from '../../utilities/response-helpers.js';

// Config lives in a temp folder that is NOT the working directory, so this
// also proves rule files resolve relative to the config file.
describe('generateResponseContent with responseRules', () => {
	let dir: string;
	const previous = {
		type: process.env.MOCK_LLM_RESPONSE_TYPE,
		max: process.env.MAX_LOREM_PARAS,
		model: process.env.LLM_MODEL_NAME,
	};

	const preset = (responseRules?: unknown) => ({
		name: 'claude',
		model: 'claude-opus-5-5',
		endpoint: 'v1/messages',
		responseType: 'lorem',
		maxLoremParas: 3,
		validateRequests: false,
		logRequests: false,
		debug: false,
		stream: false,
		responseDelay: { min: 0, max: 0 },
		embeddings: { enabled: false, dimensions: 128 },
		...(responseRules ? { responseRules } : {}),
	});

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-rules-int-'));
		mkdirSync(join(dir, 'fixtures'));
		writeFileSync(join(dir, 'fixtures', 'json.json'), '{\n  "a": 1\n}\n');
		writeFileSync(join(dir, 'fixtures', 'text.txt'), 'canned text');

		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'with-rules',
				models: {
					'with-rules': preset([
						{ match: 'WANT_JSON', file: 'fixtures/json.json' },
						{ match: 'WANT_TEXT', file: 'fixtures/text.txt' },
						{ match: 'WANT_MISSING', file: 'fixtures/missing.txt' },
					]),
					'no-rules': preset(),
				},
				server: { port: 8001, host: '0.0.0.0' },
			}),
		);

		loadConfig(configPath);
		process.env.LLM_MODEL_NAME = 'with-rules';
		process.env.MOCK_LLM_RESPONSE_TYPE = 'lorem';
		process.env.MAX_LOREM_PARAS = '3';
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
		for (const [key, value] of [
			['MOCK_LLM_RESPONSE_TYPE', previous.type],
			['MAX_LOREM_PARAS', previous.max],
			['LLM_MODEL_NAME', previous.model],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	const body = (text: string) => ({
		messages: [{ role: 'user', content: text }],
	});

	test('returns the fixture file when the request matches a rule', async () => {
		expect(
			(await generateResponseContent(body('please WANT_JSON'))).text,
		).toBe('{\n  "a": 1\n}\n');
		expect((await generateResponseContent(body('WANT_TEXT'))).text).toBe(
			'canned text',
		);
	});

	test('matches text in the system prompt too', async () => {
		const { text: content } = await generateResponseContent({
			system: [{ type: 'text', text: 'WANT_TEXT' }],
			messages: [{ role: 'user', content: 'hi' }],
		});
		expect(content).toBe('canned text');
	});

	test('falls through to generated text when nothing matches', async () => {
		const { text: content } = await generateResponseContent(
			body('no marker'),
		);

		expect(content).not.toBe('canned text');
		expect(content.length).toBeGreaterThan(0);
	});

	test('falls through to generated text with no request body', async () => {
		const { text: content } = await generateResponseContent();

		expect(content).not.toBe('canned text');
		expect(content.length).toBeGreaterThan(0);
	});

	test('errors clearly when a matched fixture file is missing', async () => {
		await expect(
			generateResponseContent(body('WANT_MISSING')),
		).rejects.toThrow(/fixture file not found.*missing\.txt/);
	});

	test('a preset without rules always generates text', async () => {
		process.env.LLM_MODEL_NAME = 'no-rules';
		try {
			const { text: content } = await generateResponseContent(
				body('WANT_TEXT'),
			);
			expect(content).not.toBe('canned text');
		} finally {
			process.env.LLM_MODEL_NAME = 'with-rules';
		}
	});
});
