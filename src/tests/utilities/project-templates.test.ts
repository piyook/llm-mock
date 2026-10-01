import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '../../config/config-loader.js';
import { buildResponse } from '../../utilities/build-response.js';
import { validateRequest } from '../../utilities/validate-request.js';

// Templates beside the config file win over the built-in ones, wherever the
// server process itself was started from.
describe('project-level templates', () => {
	let projectDir: string;
	const previousName = process.env.LLM_NAME;

	beforeAll(() => {
		projectDir = mkdtempSync(join(tmpdir(), 'llmock-templates-'));
		mkdirSync(join(projectDir, 'request-templates'));
		mkdirSync(join(projectDir, 'response-templates'));
		writeFileSync(
			join(projectDir, 'request-templates', 'custom_req.json'),
			JSON.stringify([{ prompt: 'string' }]),
		);
		writeFileSync(
			join(projectDir, 'response-templates', 'custom_res.json'),
			JSON.stringify([
				{ output: 'DYNAMIC_CONTENT_HERE', source: 'project' },
			]),
		);

		process.env.LLM_NAME = 'custom';
		process.env.VALIDATE_REQUESTS = 'ON';
		process.env.LOG_REQUESTS = 'OFF';
		loadConfig(join(projectDir, '.llmockrc.json'));
	});

	afterAll(() => {
		rmSync(projectDir, { recursive: true, force: true });
		if (previousName === undefined) {
			delete process.env.LLM_NAME;
		} else {
			process.env.LLM_NAME = previousName;
		}
	});

	test('the response is built from the project template', async () => {
		expect(await buildResponse('hello')).toEqual({
			output: 'hello',
			source: 'project',
		});
	});

	test('requests are validated against the project template', async () => {
		expect(await validateRequest({ body: { prompt: 'hi' } })).toBe(true);
		expect(await validateRequest({ body: { messages: [] } })).toBe(false);
	});
});
