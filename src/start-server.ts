import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import fastify, { type FastifyInstance } from 'fastify';
import * as seeders from './seeders/index.js';
import getApiRoutes from './utilities/file-scan.js';
import serverPage from './utilities/server-page.js';
import adminApi, { adminApiEnabled } from './utilities/admin-api.js';
import { db, dbLoadFromDisk } from './models/db.js';
import {
	getCurrentModel,
	getDefaultConfig,
	getResponseRules,
	getStoredResponsesFile,
	loadConfig,
	setEnvironmentFromConfig,
	useConfig,
	type LlmMockConfig,
} from './config/config-loader.js';
import {
	readRuleContent,
	readRuleFile,
	ruleFiles,
} from './utilities/response-rules.js';
import { loadStoredResponses } from './utilities/stored-responses.js';
import { releaseStalledOnClose, resetChaos } from './utilities/chaos.js';
import { clearRuntimeRules } from './utilities/runtime-rules.js';
import {
	applyConfigDefaults,
	resolveModelName,
	serverEnv,
} from '../bin/process-utils.js';

export type { LlmMockConfig } from './config/config-loader.js';

export interface StartServerOptions {
	/**
	 * The configuration: a path to a `.llmockrc.json`-style file (relative to
	 * the working directory), or the configuration itself. Default
	 * `./.llmockrc.json`, or the built-in presets when there is none.
	 */
	config?: string | LlmMockConfig;
	/** The preset to run (default the config's `defaultModel`) */
	model?: string;
	/** Port to listen on; 0 picks a free one (default the config's `server.port`) */
	port?: number;
	/** Address to listen on (default 127.0.0.1, not the config's `server.host`) */
	host?: string;
	/**
	 * Any other CLI option, by its flag name without the dashes, e.g.
	 * `{ stream: true, delayMin: 0, chaos: true }`. These win over the config.
	 */
	settings?: Record<string, string | number | boolean | undefined>;
}

export interface RunningServer {
	/** The port the server listens on (the real one when 0 was asked for) */
	port: number;
	host: string;
	/** Base URL to send requests to, e.g. `http://127.0.0.1:54321` */
	url: string;
	/** Stops the server and puts back the environment variables it set */
	close(): Promise<void>;
}

/**
 * Starts a server from the settings in the environment (see
 * setEnvironmentFromConfig), as the CLI leaves them. Returns once it listens.
 */
export async function bootServer({ quiet = false } = {}): Promise<{
	app: FastifyInstance;
	port: number;
	host: string;
}> {
	// Use config path from the CLI if given, otherwise ./.llmockrc.json
	const config = loadConfig(process.env.CONFIG_PATH);
	setEnvironmentFromConfig(process.env.LLM_MODEL_NAME || config.defaultModel);

	// Fail fast on malformed responseRules and warn about fixture files that can't be read
	const { rules: responseRules, baseDir: rulesDir } = getResponseRules();
	for (const rule of responseRules) {
		let readable = true;
		for (const file of ruleFiles(rule)) {
			try {
				readRuleFile(rule, file, rulesDir);
			} catch (error) {
				readable = false;
				console.warn(`WARNING: ${(error as Error).message}`);
			}
		}

		// A contentFile that is there but holds bad JSON or blocks is warned about
		// like a missing one: the requests it matches fail with the same message
		if (rule.contentFile !== undefined && readable) {
			try {
				readRuleContent(rule, rulesDir);
			} catch (error) {
				console.warn(`WARNING: ${(error as Error).message}`);
			}
		}
	}

	// Fail fast on a malformed storedResponsesFile path, and on a file that can't
	// be used when stored responses are what this server will serve
	const { file: storedFile, baseDir: storedDir } = getStoredResponsesFile();
	if (storedFile && process.env.MOCK_LLM_RESPONSE_TYPE === 'stored') {
		loadStoredResponses(storedFile, storedDir);
	}

	// Nothing is left over from a server started earlier in this process
	clearRuntimeRules();
	resetChaos();

	const app = fastify({ logger: false });

	// A connection held open by chaos must not keep the server from stopping
	releaseStalledOnClose(app);

	const { apiRoutes } = await getApiRoutes(app, !quiet);

	serverPage(app, apiRoutes);

	if (adminApiEnabled()) adminApi(app);

	// Load database from disk if persistence is enabled
	const loaded = dbLoadFromDisk();

	// Execute dB seeder functions only if database wasn't loaded from disk
	const seedRequested =
		process.env?.MOCK_DB_SEED_ON_START?.toUpperCase() === 'ON';
	const shouldSeed = seedRequested || !loaded;

	if (shouldSeed) {
		if (!loaded) db.llm.__unsafe_replaceAll([]);
		for (const seeder of Object.values(seeders)) {
			seeder();
		}
	}

	const host = process.env?.SERVER_HOST || '0.0.0.0';
	await app.listen({
		port: Number(process.env?.SERVER_PORT ?? 8001),
		host,
	});

	// With port 0 the system picked one: everything that shows the port
	// (dashboard, error messages) reads it from here
	const { port } = app.server.address() as AddressInfo;
	process.env.SERVER_PORT = String(port);

	if (!quiet) {
		console.log('\n*****************************************************');
		console.log(`SERVER UP AND RUNNING ON LOCALHOST:${port}`);
		console.log(
			`USING MODEL: ${getCurrentModel()?.toUpperCase() || 'CHATGPT'}`,
		);
		console.log('*****************************************************');
	}

	return { app, port, host };
}

// The configuration a startServer call asked for, and the folder its files
// resolve against
function readConfig(config: StartServerOptions['config']): {
	config: LlmMockConfig;
	dir: string;
	path?: string;
} {
	if (config !== undefined && typeof config === 'object') {
		return { config: structuredClone(config), dir: process.cwd() };
	}

	const path = resolve(process.cwd(), config ?? '.llmockrc.json');
	if (!existsSync(path)) {
		if (config !== undefined) {
			throw new Error(`llmock config file not found: ${path}`);
		}

		return { config: getDefaultConfig(), dir: process.cwd() };
	}

	try {
		return {
			config: JSON.parse(readFileSync(path, 'utf8')) as LlmMockConfig,
			dir: dirname(path),
			path,
		};
	} catch (error) {
		throw new Error(
			`Failed to parse llmock config file ${path}: ${(error as Error).message}`,
		);
	}
}

// URL a client on this machine reaches `host` and `port` at
function urlFor(host: string, port: number): string {
	const reachable = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
	return `http://${reachable.includes(':') ? `[${reachable}]` : reachable}:${port}`;
}

// Settings live in process.env and in module state, so one server at a time
let running = false;

/**
 * Starts a mock server in this process, for tests:
 *
 * ```ts
 * const server = await startServer({ config: '.llmockrc.json', port: 0 });
 * await fetch(`${server.url}/v1/messages`, ...);
 * await server.close();
 * ```
 *
 * The server's settings are environment variables and module state, so only
 * one runs per process at a time; a second call before close() throws. Test
 * runners that give each test file its own process (as Vitest does by
 * default) can run one per file in parallel.
 */
export async function startServer(
	options: StartServerOptions = {},
): Promise<RunningServer> {
	if (running) {
		throw new Error(
			'An llmock server is already running in this process; close() it before starting another',
		);
	}

	const { config, dir, path } = readConfig(options.config);
	const model = resolveModelName(options.model, config);
	if (!config.models?.[model]) {
		throw new Error(
			`Model "${model}" not found in the llmock configuration. Available models: ${Object.keys(config.models ?? {}).join(', ')}`,
		);
	}

	const env = serverEnv(
		applyConfigDefaults(config, model),
		model,
		{
			...options.settings,
			port: options.port ?? options.settings?.port,
			host: options.host ?? options.settings?.host ?? '127.0.0.1',
		},
		path,
	);

	// Put back on close: these, plus SERVER_PORT, which the server updates
	const previous = Object.fromEntries(
		Object.keys(env).map((key) => [key, process.env[key]]),
	);
	const restoreEnv = () => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	};

	running = true;
	Object.assign(process.env, env);
	useConfig(config, dir);

	let started: Awaited<ReturnType<typeof bootServer>>;
	try {
		started = await bootServer({ quiet: true });
	} catch (error) {
		restoreEnv();
		running = false;
		throw error;
	}

	const { app, port, host } = started;
	let closing: Promise<void> | undefined;

	return {
		port,
		host,
		url: urlFor(host, port),
		close() {
			closing ??= app.close().then(() => {
				restoreEnv();
				running = false;
			});
			return closing;
		},
	};
}
