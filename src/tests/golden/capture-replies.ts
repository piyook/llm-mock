/* eslint-disable  @typescript-eslint/naming-convention */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { faker } from '@faker-js/faker';
import fastify from 'fastify';
import { loadConfig } from '../../config/config-loader.js';

/**
 * Sends a fixed set of requests through the real chat route and returns what
 * came back, byte for byte. It only uses settings that llmock 3.9.0 already
 * had, so running it on that version gives the reference output kept in
 * replies-3.9.0.json:
 *
 *   npx tsx src/tests/golden/capture-replies.ts > src/tests/golden/replies-3.9.0.json
 *
 * (on a 3.9.0 checkout, with this file copied in). The byte-identical test
 * runs it on the current code and compares.
 */

export type CapturedReply = {
	status: number;
	headers: Record<string, unknown>;
	payload: string;
};

// The headers a client can tell apart; `date` and the like change per run
const keptHeaders = [
	'content-type',
	'cache-control',
	'access-control-allow-origin',
	'retry-after',
	'x-llmock-chaos',
];

const formats = ['claude', 'openai', 'gemini'];

export async function captureReplies(): Promise<Record<string, CapturedReply>> {
	const dir = mkdtempSync(join(tmpdir(), 'llmock-golden-'));
	mkdirSync(join(dir, 'fixtures'));
	writeFileSync(
		join(dir, 'fixtures', 'reply.txt'),
		'{\n  "verdict": "ok",\n  "note": "one two three four five six seven"\n}\n',
	);

	const configPath = join(dir, '.llmockrc.json');
	writeFileSync(
		configPath,
		JSON.stringify({
			defaultModel: 'golden',
			models: {
				golden: {
					name: 'claude',
					model: 'claude-opus-5-5',
					endpoint: 'chat',
					responseType: 'lorem',
					maxLoremParas: 3,
					validateRequests: false,
					logRequests: false,
					debug: false,
					stream: false,
					responseDelay: { min: 0, max: 0 },
					embeddings: { enabled: false, dimensions: 128 },
					responseRules: [
						{ match: 'GOLDEN', file: 'fixtures/reply.txt' },
					],
				},
			},
			server: { port: 8001, host: '0.0.0.0' },
		}),
	);

	const previousEnv = { ...process.env };
	// A format with no `created` in its template stamps the stream with the
	// current time
	const realNow = Date.now;
	Date.now = () => 1_790_000_000_000;
	loadConfig(configPath);
	Object.assign(process.env, {
		LLM_MODEL_NAME: 'golden',
		LLM_URL_ENDPOINT: 'chat',
		LLM_MODEL: 'claude-opus-5-5',
		MOCK_LLM_RESPONSE_TYPE: 'lorem',
		MAX_LOREM_PARAS: '3',
		VALIDATE_REQUESTS: 'OFF',
		LOG_REQUESTS: 'OFF',
		RESPONSE_DELAY_MIN: '0',
		RESPONSE_DELAY_MAX: '0',
		CHAOS_FREQUENCY: '1',
		CHAOS_MODE: 'every',
	});

	const { default: handler } = await import('../../api/completions/api.js');
	const app = fastify({ logger: false });
	handler(app, 'chat');

	const captured: Record<string, CapturedReply> = {};

	const capture = async (
		name: string,
		format: string,
		settings: Record<string, string>,
		stream: boolean,
	) => {
		Object.assign(process.env, {
			LLM_NAME: format,
			STREAM: 'false',
			CHAOS_ENABLED: 'false',
			CHAOS_STATUS: '500',
			...settings,
		});
		// Ids are random; the same seed gives the same ones each time
		faker.seed(3090);

		const response = await app.inject({
			method: 'POST',
			url: '/chat',
			payload: {
				model: 'golden-model',
				max_tokens: 64,
				stream,
				messages: [{ role: 'user', content: 'GOLDEN please' }],
			},
		});

		captured[name] = {
			status: response.statusCode,
			headers: Object.fromEntries(
				keptHeaders
					.filter((header) => header in response.headers)
					.map((header) => [header, response.headers[header]]),
			),
			payload: response.payload,
		};
	};

	try {
		for (const format of formats) {
			// A rule with no stopReason, not streamed and streamed
			await capture(`${format} static`, format, {}, false);
			await capture(
				`${format} streamed`,
				format,
				{ STREAM: 'true' },
				true,
			);

			// Chaos with no kind set, for a call that did not ask for a
			// stream and one that did
			for (const status of ['500', '429', '529']) {
				const chaos = { CHAOS_ENABLED: 'true', CHAOS_STATUS: status };
				await capture(
					`${format} chaos ${status}`,
					format,
					chaos,
					false,
				);
				await capture(
					`${format} chaos ${status} streamed`,
					format,
					{ ...chaos, STREAM: 'true' },
					true,
				);
			}
		}
	} finally {
		await app.close();
		rmSync(dir, { recursive: true, force: true });
		process.env = previousEnv;
		Date.now = realNow;
	}

	return captured;
}

// Run directly: print the captured replies as JSON
if (
	process.argv[1]?.replace(/\\/g, '/').endsWith('golden/capture-replies.ts')
) {
	console.log(JSON.stringify(await captureReplies(), null, '\t'));
}
