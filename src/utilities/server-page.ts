import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import {
	getResponseRules,
	getStoredResponsesFile,
} from '../config/config-loader.js';
import { db } from '../models/db.js';
import { getChaosConfig, getChaosStats } from './chaos.js';
import { clearLog, logPath, maxLogEntries } from './logger.js';
import { readRuleFile, ruleFiles } from './response-rules.js';
import { loadStoredResponses } from './stored-responses.js';

const prefix = process.env?.LLM_URL_ENDPOINT ?? '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiDistDir = path.resolve(__dirname, '../../ui/dist');

// Version of the llmock package this server is running from, null if its
// package.json can't be read.
function readPackageVersion(): string | null {
	try {
		const packageJson = JSON.parse(
			fs.readFileSync(
				path.resolve(__dirname, '../../package.json'),
				'utf8',
			),
		) as { version?: unknown };
		return typeof packageJson.version === 'string'
			? packageJson.version
			: null;
	} catch {
		return null;
	}
}

const version = readPackageVersion();

// The pool `responseType: "stored"` picks from: the preset's own file if
// configured, otherwise the bundled texts. Throws if that file can't be used.
function readStoredResponses(): string[] {
	const { file, baseDir } = getStoredResponsesFile();
	if (!file) return db.llm.getAll().map((item) => item.content);

	return loadStoredResponses(file, baseDir);
}

// Size of that pool, 0 if the file can't be used.
function countStoredResponses(): number {
	try {
		return readStoredResponses().length;
	} catch {
		return 0;
	}
}

function contentTypeForPath(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case '.html':
			return 'text/html; charset=utf-8';
		case '.js':
			return 'text/javascript; charset=utf-8';
		case '.css':
			return 'text/css; charset=utf-8';
		case '.json':
			return 'application/json; charset=utf-8';
		case '.svg':
			return 'image/svg+xml';
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.ico':
			return 'image/x-icon';
		case '.map':
			return 'application/json; charset=utf-8';
		default:
			return 'application/octet-stream';
	}
}

function tryReadUiDistFile(
	relativePath: string,
): { absPath: string; data: Buffer } | null {
	const absPath = path.resolve(uiDistDir, relativePath.replace(/^\/+/, ''));
	const rel = path.relative(uiDistDir, absPath);
	if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
	if (!fs.existsSync(absPath)) return null;
	const stat = fs.statSync(absPath);
	if (!stat.isFile()) return null;
	return { absPath, data: fs.readFileSync(absPath) };
}

const fallbackHtmlString = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mock LLM Server Dashboard</title>
        <style>
            :root {
                --bg-main: #23272F;
                --bg-card: #2D333B;
                --accent: #4F8A8B;
                --accent2:rgb(144, 33, 2);
                --text-main: #F9F9F9;
                --text-muted: #A7A9BE;
                --border-radius: 14px;
                --shadow: 0 4px 24px rgba(0,0,0,0.3);
            }
            html, body {
                margin: 0;
                padding: 0;
                min-height: 100vh;
                color: var(--text-main);
                font-family: 'Segoe UI', 'Roboto', 'Arial', sans-serif;
                background: linear-gradient(120deg, #20232a 0%, #23272F 70%, #0d1117 100%);
            }
            body {
                min-height: 100vh;
                width: 100vw;
            }
            main {
                padding: 56px 3vw 40px 3vw;
                width: 95vw;
                max-width: 800px;
                min-width: 320px;
                margin: 48px auto 32px auto;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 32px;
                transition: box-shadow 0.2s, background 0.2s, max-width 0.2s;
            }
            h1 {
              text-align: center;
                font-size: 2.4rem;
                font-weight: 700;
                letter-spacing: 1px;
                text-align: center;
            }
            .highlight {
                background: var(--accent2);
                padding: 4px 10px;
                border-radius: 6px;
                color: #fff;
                font-weight: 600;
                letter-spacing: 0.5px;
                font-size: 1rem;
            }
        </style>
        <main>
            <section>
              <h1>Mock LLM Server</h1>
                <h1 class="highlight">ERROR: Please build dashboard UI - use 'npm run compile-ui'</h1>
            </section>
    </body>
    </html>
    `;

function serverPage(app: FastifyInstance, _apiPaths: string[]) {
	// UI meta endpoint for the compiled Svelte dashboard
	app.get('/ui-meta', async (_request, reply) => {
		const storedActive = process.env.MOCK_LLM_RESPONSE_TYPE === 'stored';
		const storedResponsesCount = storedActive
			? countStoredResponses()
			: null;
		// Configured path as written in the config; null means the bundled texts
		const storedResponsesFile = storedActive
			? (getStoredResponsesFile().file ?? null)
			: null;

		// Rules in config order (first match wins), each with every file it
		// can reply with
		const responseRules = getResponseRules().rules.map((rule) => ({
			match: rule.match,
			files: ruleFiles(rule),
		}));

		const responseDelayMinMs =
			Number(process.env?.RESPONSE_DELAY_MIN ?? 0) || 0;
		const responseDelayMaxMs =
			Number(process.env?.RESPONSE_DELAY_MAX ?? 0) || 0;
		const delayStatus =
			responseDelayMinMs > 0 || responseDelayMaxMs > 0
				? 'ENABLED'
				: 'DISABLED';
		const streamingStatus =
			process.env?.STREAM?.toLowerCase() === 'true'
				? 'ENABLED'
				: 'DISABLED';

		const embeddingsEnabled =
			process.env?.ENABLE_EMBEDDINGS_MOCK?.toLowerCase() !== 'false';
		const embeddingDimension =
			Number(process.env?.EMBEDDING_DIMENSION) || 128;

		const chaos = getChaosConfig();

		// Create unique API links to avoid Svelte duplicate key errors
		const apiLinksSet = new Set<string>();

		// Add main API endpoint
		apiLinksSet.add(`/${prefix}`);

		// Add embeddings endpoint link if enabled
		if (embeddingsEnabled) {
			apiLinksSet.add('/v1/embeddings');
		}

		// Convert Set to array of objects
		const apiLinks = Array.from(apiLinksSet).map((href) => ({
			href: href,
			label: href,
		}));

		return reply.send({
			version,
			serverPort: Number(process.env?.SERVER_PORT ?? '') || null,
			llmUrlEndpoint: process.env?.LLM_URL_ENDPOINT ?? '',
			llmName: process.env?.LLM_NAME ?? '',
			llmModel: process.env?.LLM_MODEL ?? 'NONE DEFINED',
			mockResponseType: process.env?.MOCK_LLM_RESPONSE_TYPE ?? '',
			maxLoremParas:
				process.env.MOCK_LLM_RESPONSE_TYPE === 'lorem'
					? Number(process.env?.MAX_LOREM_PARAS ?? '') || null
					: null,
			storedResponsesCount,
			storedResponsesFile,
			responseRules,
			validateRequests: process.env?.VALIDATE_REQUESTS ?? '',
			logRequests: process.env?.LOG_REQUESTS ?? '',
			maxLoggedRequests: maxLogEntries(),
			debugMode: process.env.DEBUG === '*' ? 'ON' : 'OFF',
			responseDelayMinMs,
			responseDelayMaxMs,
			delayStatus,
			streamingStatus,
			chaosStatus: chaos.enabled ? 'ENABLED' : 'DISABLED',
			chaosFrequency: chaos.frequency,
			chaosMode: chaos.mode,
			chaosErrorStatus: chaos.status,
			chaosInjected: getChaosStats().injected,
			embeddingsEnabled: embeddingsEnabled ? 'ENABLED' : 'DISABLED',
			embeddingDimension,
			apiLinks,
		});
	});

	// Texts of the stored responses pool, for the dashboard viewer
	app.get('/ui-stored-responses', async (_request, reply) => {
		const file = getStoredResponsesFile().file ?? null;

		try {
			return reply.send({ file, responses: readStoredResponses() });
		} catch (error) {
			return reply.code(500).send({ error: (error as Error).message });
		}
	});

	// Contents of one response rule fixture, for the dashboard viewer. Files
	// are addressed by position in the config (?rule=0&file=0), never by path,
	// so only configured fixtures can be read.
	app.get('/ui-rule-file', async (request, reply) => {
		const query = request.query as { rule?: string; file?: string };
		const { rules, baseDir } = getResponseRules();
		const rule = rules[Number(query.rule ?? 0)];
		const file = rule && ruleFiles(rule)[Number(query.file ?? 0)];

		if (!rule || !file) {
			return reply
				.code(404)
				.send({ error: 'No such response rule file' });
		}

		try {
			return reply.send({
				match: rule.match,
				file,
				content: readRuleFile(rule, file, baseDir),
			});
		} catch (error) {
			return reply.code(500).send({ error: (error as Error).message });
		}
	});

	// The most recent validated requests, newest first, for the dashboard
	// viewer. `log` is null when no request has been logged yet.
	app.get('/ui-request-log', async (_request, reply) => {
		let log: unknown = null;
		try {
			log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
			// A log written under a higher limit is only trimmed on the
			// next request
			if (Array.isArray(log)) log = log.slice(0, maxLogEntries());
		} catch {
			// No log file yet, or one that is mid-write
		}

		return reply.send({ file: logPath, log });
	});

	// Empties the request log, for the dashboard's "Clear logs" button
	app.delete('/ui-request-log', async (_request, reply) => {
		try {
			clearLog();
		} catch (error) {
			return reply.code(500).send({ error: (error as Error).message });
		}

		return reply.send({ file: logPath, log: null });
	});

	// Home page route
	app.get('/', async (_request, reply) => {
		const uiIndex = tryReadUiDistFile('index.html');
		if (uiIndex) {
			return reply
				.type(contentTypeForPath(uiIndex.absPath))
				.send(uiIndex.data);
		}
		return reply.type('text/html').send(fallbackHtmlString);
	});

	// Ping endpoint for status check
	app.get('/ping', async (_request, reply) => {
		return reply.send({ response: 'server is running' });
	});

	// Serve built Vite assets when present
	app.get('/assets/*', async (request, reply) => {
		const star =
			(request.params as Record<string, string> | undefined)?.['*'] ?? '';
		const file = tryReadUiDistFile(path.join('assets', star));
		if (!file) return reply.code(404).send();
		return reply.type(contentTypeForPath(file.absPath)).send(file.data);
	});

	// Serve any built root-level file (favicon, manifest, etc.)
	app.get('/:file', async (request, reply) => {
		const fileName = (request.params as { file: string }).file;
		if (!fileName.includes('.')) return reply.code(404).send();
		const file = tryReadUiDistFile(fileName);
		if (!file) return reply.code(404).send();
		return reply.type(contentTypeForPath(file.absPath)).send(file.data);
	});
}

export default serverPage;
