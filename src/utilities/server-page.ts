import '@dotenvx/dotenvx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { db } from '../models/db.js';

const prefix = process.env?.LLM_URL_ENDPOINT ?? '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiDistDir = path.resolve(__dirname, '../../ui/dist');

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

function serverPage(app: FastifyInstance, apiPaths: string[]) {
	// UI meta endpoint for the compiled Svelte dashboard
	app.get('/ui-meta', async (_request, reply) => {
		const dbEntries = db.llm.getAll()?.length ?? 0;
		const storedResponsesCount =
			process.env.MOCK_LLM_RESPONSE_TYPE === 'stored' ? dbEntries : null;

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

		const apiLinks = apiPaths.map(() => ({
			href: `/${prefix}`,
			label: `/${prefix}`,
		}));

		return reply.send({
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
			validateRequests: process.env?.VALIDATE_REQUESTS ?? '',
			logRequests: process.env?.LOG_REQUESTS ?? '',
			debugMode: process.env.DEBUG === '*' ? 'ON' : 'OFF',
			responseDelayMinMs,
			responseDelayMaxMs,
			delayStatus,
			streamingStatus,
			apiLinks,
		});
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
