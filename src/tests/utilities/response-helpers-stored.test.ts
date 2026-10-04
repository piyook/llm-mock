/* eslint-disable  @typescript-eslint/naming-convention */
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import { gptSeeder } from '../../seeders/gpt-seeder.js';
import {
	buildStaticResponse,
	generateResponseContent,
} from '../../utilities/response-helpers.js';
import { generateStreamingChunks } from '../../utilities/build-streaming-response.js';
import { buildClaudeStaticResponse } from '../../utilities/build-claude-response.js';
import { generateClaudeStreamingChunks } from '../../utilities/build-claude-streaming-response.js';

const require = createRequire(import.meta.url);
const bundled: string[] = require('../../data/data.json').map(
	(item: { content: string }) => item.content,
);

// Config lives in a temp folder that is NOT the working directory, so this
// also proves the stored responses file resolves relative to the config file.
describe('generateResponseContent with storedResponsesFile', () => {
	let dir: string;
	const previous = {
		type: process.env.MOCK_LLM_RESPONSE_TYPE,
		model: process.env.LLM_MODEL_NAME,
		name: process.env.LLM_NAME,
		delayMin: process.env.RESPONSE_DELAY_MIN,
		delayMax: process.env.RESPONSE_DELAY_MAX,
	};

	const strings = ['first reply', 'second reply', 'third reply'];
	const objects = ['object reply one', 'object reply two'];

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
		dir = mkdtempSync(join(tmpdir(), 'llmock-stored-int-'));
		mkdirSync(join(dir, 'fixtures'));
		writeFileSync(
			join(dir, 'fixtures', 'strings.json'),
			JSON.stringify(strings),
		);
		writeFileSync(
			join(dir, 'fixtures', 'objects.json'),
			JSON.stringify(
				objects.map((content, index) => ({ id: index + 1, content })),
			),
		);
		writeFileSync(join(dir, 'fixtures', 'text.txt'), 'canned text');

		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'strings',
				models: {
					strings: preset({
						storedResponsesFile: 'fixtures/strings.json',
						responseRules: [
							{ match: 'WANT_TEXT', file: 'fixtures/text.txt' },
						],
					}),
					objects: preset({
						storedResponsesFile: 'fixtures/objects.json',
					}),
					bundled: preset(),
					missing: preset({
						storedResponsesFile: 'fixtures/missing.json',
					}),
					'bad-path': preset({ storedResponsesFile: '' }),
				},
				server: { port: 8001, host: '0.0.0.0' },
			}),
		);

		loadConfig(configPath);
		gptSeeder();
		process.env.LLM_MODEL_NAME = 'strings';
		process.env.MOCK_LLM_RESPONSE_TYPE = 'stored';
		process.env.RESPONSE_DELAY_MIN = '0';
		process.env.RESPONSE_DELAY_MAX = '0';
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
		for (const [key, value] of [
			['MOCK_LLM_RESPONSE_TYPE', previous.type],
			['LLM_MODEL_NAME', previous.model],
			['LLM_NAME', previous.name],
			['RESPONSE_DELAY_MIN', previous.delayMin],
			['RESPONSE_DELAY_MAX', previous.delayMax],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	const body = (text: string) => ({
		model: 'claude-opus-5-5',
		max_tokens: 100,
		messages: [{ role: 'user', content: text }],
	});

	// Runs `run` with another preset active, then switches back
	const withPreset = async (name: string, run: () => Promise<void>) => {
		process.env.LLM_MODEL_NAME = name;
		try {
			await run();
		} finally {
			process.env.LLM_MODEL_NAME = 'strings';
		}
	};

	const sample = async (count = 40) => {
		const seen = new Set<string>();
		for (let i = 0; i < count; i++) {
			seen.add((await generateResponseContent(body('no marker'))).text);
		}
		return seen;
	};

	test('picks from the configured file (array of strings)', async () => {
		const seen = await sample();

		for (const content of seen) expect(strings).toContain(content);
		expect(seen.size).toBeGreaterThan(1);
	});

	test('picks from the configured file (bundled { id, content } shape)', async () => {
		await withPreset('objects', async () => {
			const seen = await sample();

			for (const content of seen) expect(objects).toContain(content);
			expect(seen.size).toBeGreaterThan(1);
		});
	});

	test('uses the bundled data when no file is configured', async () => {
		await withPreset('bundled', async () => {
			for (const content of await sample()) {
				expect(bundled).toContain(content);
			}
		});
	});

	test('picks up edits to the file without a restart', async () => {
		const path = join(dir, 'fixtures', 'strings.json');
		writeFileSync(path, JSON.stringify(['edited reply']));
		try {
			expect(
				(await generateResponseContent(body('no marker'))).text,
			).toBe('edited reply');
		} finally {
			writeFileSync(path, JSON.stringify(strings));
		}
	});

	test('a matching response rule wins over stored responses', async () => {
		expect((await generateResponseContent(body('WANT_TEXT'))).text).toBe(
			'canned text',
		);
	});

	test('is ignored when the response type is not stored', async () => {
		process.env.MOCK_LLM_RESPONSE_TYPE = 'lorem';
		try {
			const { text: content } = await generateResponseContent(
				body('no marker'),
			);
			expect(strings).not.toContain(content);
		} finally {
			process.env.MOCK_LLM_RESPONSE_TYPE = 'stored';
		}
	});

	test('errors clearly when the configured file is missing', async () => {
		await withPreset('missing', async () => {
			await expect(
				generateResponseContent(body('no marker')),
			).rejects.toThrow(
				/storedResponsesFile: file not found.*missing\.json/,
			);
		});
	});

	test('errors clearly when the configured path is empty', async () => {
		await withPreset('bad-path', async () => {
			await expect(
				generateResponseContent(body('no marker')),
			).rejects.toThrow(/storedResponsesFile must be a non-empty string/);
		});
	});

	test('static and streamed replies carry the stored text (openai)', async () => {
		process.env.LLM_NAME = 'openai';
		const { text: content } = await generateResponseContent(
			body('no marker'),
		);

		const response = (await buildStaticResponse({ text: content })) as any;
		expect(response.choices[0].message.content).toBe(content);

		const chunks = await generateStreamingChunks(content);
		const streamed = chunks
			.slice(0, -1)
			.map(
				(chunk) =>
					JSON.parse(chunk.replace('data: ', '')).choices[0].delta
						.content ?? '',
			)
			.join('');
		expect(streamed).toBe(content);
	});

	test('static and streamed replies carry the stored text (claude)', async () => {
		process.env.LLM_NAME = 'claude';
		const request = body('no marker');
		const { text: content } = await generateResponseContent(request);

		const response = (await buildClaudeStaticResponse(
			{ text: content },
			request,
		)) as any;
		expect(response.content[0].text).toBe(content);

		const streamed = generateClaudeStreamingChunks(content, request.model)
			.map((chunk) => JSON.parse(chunk.split('\n')[1].slice(6)))
			.filter((data) => data.type === 'content_block_delta')
			.map((data) => data.delta.text)
			.join('');
		expect(streamed).toBe(content);
	});
});
