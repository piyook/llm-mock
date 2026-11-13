import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
	startServer,
	type LlmMockConfig,
	type RunningServer,
} from '../index.js';
import { getConfigDir, loadConfig } from '../config/config-loader.js';

const config: LlmMockConfig = {
	defaultModel: 'claude',
	models: {
		claude: {
			name: 'claude',
			model: 'claude-opus-5-5',
			endpoint: 'v1/messages',
			responseType: 'lorem',
			maxLoremParas: 2,
			validateRequests: false,
			logRequests: false,
			debug: false,
			stream: false,
			responseDelay: { min: 0, max: 0 },
			embeddings: { enabled: false, dimensions: 128 },
			responseRules: [{ match: 'WANT_RULE', text: 'from the rule' }],
		},
		chatgpt: {
			name: 'openai',
			model: 'gpt-4o',
			endpoint: 'chatgpt/chat/completions',
			responseType: 'lorem',
			maxLoremParas: 2,
			validateRequests: false,
			logRequests: false,
			debug: false,
			stream: false,
			responseDelay: { min: 0, max: 0 },
			embeddings: { enabled: false, dimensions: 128 },
		},
	},
	server: { port: 8001, host: '0.0.0.0' },
};

const ask = (server: RunningServer, text: string, path = 'v1/messages') =>
	fetch(`${server.url}/${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: 'claude-opus-5-5',
			max_tokens: 100,
			messages: [{ role: 'user', content: text }],
		}),
	});

describe('startServer', () => {
	let server: RunningServer | undefined;
	let dir: string;
	const previousPort = process.env.SERVER_PORT;
	const previousHost = process.env.SERVER_HOST;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'llmock-start-server-'));
	});

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('port 0 listens on a free port and reports it', async () => {
		server = await startServer({ config, port: 0 });

		expect(server.port).toBeGreaterThan(0);
		expect(server.host).toBe('127.0.0.1');
		expect(server.url).toBe(`http://127.0.0.1:${server.port}`);

		const ping = await fetch(`${server.url}/ping`);
		expect(ping.ok).toBe(true);

		// The dashboard shows the real port, not 0
		const meta = (await (await fetch(`${server.url}/ui-meta`)).json()) as {
			serverPort: number;
		};
		expect(meta.serverPort).toBe(server.port);
	});

	test('serves the preset of the config it is given', async () => {
		server = await startServer({ config, port: 0 });

		const reply = (await (await ask(server, 'WANT_RULE')).json()) as {
			content: Array<{ text: string }>;
		};
		expect(reply.content[0].text).toBe('from the rule');
	});

	test('model picks another preset and settings override the config', async () => {
		server = await startServer({
			config,
			model: 'chatgpt',
			port: 0,
			settings: { maxLoremParas: 1, admin: false },
		});

		const reply = await ask(server, 'hello', 'chatgpt/chat/completions');
		expect(reply.ok).toBe(true);
		expect(((await reply.json()) as { object: string }).object).toBe(
			'chat.completion',
		);

		// admin: false leaves the admin API out
		expect((await fetch(`${server.url}/admin/rules`)).status).toBe(404);
	});

	test('reads a config file, resolving rule files against its folder', async () => {
		mkdirSync(join(dir, 'fixtures'), { recursive: true });
		writeFileSync(join(dir, 'fixtures', 'reply.txt'), 'from the file');
		const path = join(dir, 'file-config.json');
		writeFileSync(
			path,
			JSON.stringify({
				...config,
				models: {
					claude: {
						...config.models.claude,
						responseRules: [
							{ match: 'WANT_FILE', file: 'fixtures/reply.txt' },
						],
					},
				},
			}),
		);

		server = await startServer({ config: path, port: 0 });

		const reply = (await (await ask(server, 'WANT_FILE')).json()) as {
			content: Array<{ text: string }>;
		};
		expect(reply.content[0].text).toBe('from the file');
	});

	test("the dashboard links to the preset's endpoint, for each server", async () => {
		const links = async () =>
			(
				(await (await fetch(`${server!.url}/ui-meta`)).json()) as {
					apiLinks: Array<{ href: string }>;
				}
			).apiLinks.map((link) => link.href);

		server = await startServer({ config, port: 0 });
		expect(await links()).toContain('/v1/messages');
		await server.close();

		server = await startServer({ config, model: 'chatgpt', port: 0 });
		expect(await links()).toContain('/chatgpt/chat/completions');
		expect(await links()).not.toContain('/v1/messages');
	});

	test('close stops the server and puts the environment and config back', async () => {
		const previousConfigDir = getConfigDir();
		const previousConfig = loadConfig();

		// A config file in another folder, so the config folder changes too
		const path = join(dir, 'close-config.json');
		writeFileSync(path, JSON.stringify(config));

		server = await startServer({ config: path, port: 0 });
		const { url } = server;
		expect(process.env.SERVER_PORT).toBe(String(server.port));
		expect(getConfigDir()).toBe(dir);

		await server.close();
		await server.close(); // a second close is fine

		await expect(fetch(`${url}/ping`)).rejects.toThrow();
		expect(process.env.SERVER_PORT).toBe(previousPort);
		expect(process.env.SERVER_HOST).toBe(previousHost);
		expect(getConfigDir()).toBe(previousConfigDir);
		expect(loadConfig()).toEqual(previousConfig);
	});

	test('a port that is taken throws, and the next server starts clean', async () => {
		const blocker = createServer();
		await new Promise<void>((done) => blocker.listen(0, '127.0.0.1', done));
		const { port } = blocker.address() as AddressInfo;
		const previousConfigDir = getConfigDir();

		try {
			await expect(startServer({ config, port })).rejects.toThrow(
				/EADDRINUSE/,
			);
		} finally {
			await new Promise((done) => blocker.close(done));
		}

		expect(process.env.SERVER_PORT).toBe(previousPort);
		expect(getConfigDir()).toBe(previousConfigDir);

		server = await startServer({ config, port: 0 });
		expect((await fetch(`${server.url}/ping`)).ok).toBe(true);
	});

	test('one server at a time; the next one starts clean', async () => {
		server = await startServer({ config, port: 0 });
		await expect(startServer({ config, port: 0 })).rejects.toThrow(
			/already running/,
		);

		// A runtime rule added to the first server
		const added = await fetch(`${server.url}/admin/rules`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ match: 'hello', text: 'runtime' }),
		});
		expect(added.status).toBe(201);
		await server.close();

		server = await startServer({ config, port: 0 });
		const rules = (await (
			await fetch(`${server.url}/admin/rules`)
		).json()) as { rules: Array<{ source: string }> };
		expect(rules.rules.every((rule) => rule.source !== 'runtime')).toBe(
			true,
		);
	});

	test('a config that cannot be used throws and leaves nothing running', async () => {
		await expect(startServer({ config, model: 'nope' })).rejects.toThrow(
			/Model "nope" not found/,
		);
		await expect(
			startServer({ config: join(dir, 'missing.json') }),
		).rejects.toThrow(/config file not found/);

		server = await startServer({ config, port: 0 });
		expect(server.port).toBeGreaterThan(0);
	});
});
