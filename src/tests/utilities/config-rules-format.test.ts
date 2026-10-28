/* eslint-disable @typescript-eslint/naming-convention */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getResponseRules, loadConfig } from '../../config/config-loader.js';

// Replies follow LLM_NAME, which can override a preset's name, so tool-call
// rules must be checked against LLM_NAME too.
describe('getResponseRules checks tool-call rules against LLM_NAME', () => {
	let dir: string;
	const previous = {
		name: process.env.LLM_NAME,
		model: process.env.LLM_MODEL_NAME,
	};

	const preset = (name: string) => ({
		name,
		model: 'm',
		endpoint: 'v1/messages',
		responseType: 'lorem',
		maxLoremParas: 3,
		validateRequests: false,
		logRequests: false,
		debug: false,
		stream: false,
		responseDelay: { min: 0, max: 0 },
		embeddings: { enabled: false, dimensions: 128 },
		responseRules: [
			{
				match: 'Weather?',
				content: [{ type: 'tool_use', name: 'get_weather' }],
			},
		],
	});

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-rules-format-'));
		const configPath = join(dir, '.llmockrc.json');
		writeFileSync(
			configPath,
			JSON.stringify({
				defaultModel: 'named-claude',
				models: {
					'named-claude': preset('claude'),
					'named-openai': preset('openai'),
				},
				server: { port: 8001, host: '0.0.0.0' },
			}),
		);
		loadConfig(configPath);
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
		for (const [key, value] of [
			['LLM_NAME', previous.name],
			['LLM_MODEL_NAME', previous.model],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	test('refuses them when LLM_NAME is not claude, whatever the preset name', () => {
		process.env.LLM_MODEL_NAME = 'named-claude';
		process.env.LLM_NAME = 'openai';
		expect(() => getResponseRules()).toThrow(/only for the claude format/);
	});

	test('accepts them when LLM_NAME is claude, whatever the preset name', () => {
		process.env.LLM_MODEL_NAME = 'named-openai';
		process.env.LLM_NAME = 'claude';
		expect(getResponseRules().rules).toHaveLength(1);
	});

	test('falls back to the preset name when LLM_NAME is unset', () => {
		delete process.env.LLM_NAME;
		process.env.LLM_MODEL_NAME = 'named-claude';
		expect(getResponseRules().rules).toHaveLength(1);
		process.env.LLM_MODEL_NAME = 'named-openai';
		expect(() => getResponseRules()).toThrow(/only for the claude format/);
	});
});
