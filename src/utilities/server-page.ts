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

function tryReadUiDistFile(relativePath: string): { absPath: string; data: Buffer } | null {
	const absPath = path.resolve(uiDistDir, relativePath.replace(/^\/+/, ''));
	const rel = path.relative(uiDistDir, absPath);
	if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
	if (!fs.existsSync(absPath)) return null;
	const stat = fs.statSync(absPath);
	if (!stat.isFile()) return null;
	return { absPath, data: fs.readFileSync(absPath) };
}

const htmlString = (dbEntries: number) => `
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
                --accent2:rgb(1, 25, 75);
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
            @media (max-width: 700px) {
                main {
                    max-width: 99vw;
                    padding: 18px 2vw;
                    gap: 16px;
                }
            }
            .info-sticky {
                position: sticky;
                top: 0;
                z-index: 2;
              
                border-radius: 12px;
             
                padding: 16px 0 10px 0;
                margin-bottom: 18px;
                backdrop-filter: blur(2px);
            }
            @media (max-width: 700px) {
                .info-sticky {
                    margin-left: -2vw;
                    margin-right: -2vw;
                    padding-left: 2vw;
                    padding-right: 2vw;
                }
            }
            .running-dots {
                display: inline-block;
                width: 2.2em;
                min-width: 2.2em;
                letter-spacing: 0.2em;
                vertical-align: middle;
                font-family: monospace;
                font-size: 1.1em;
                text-align: left;
                overflow: hidden;
                white-space: pre;
                
            }
            h1 {
                text-align: center;
                
            }
            .status-box {
                display: flex;
                justify-content: center;
                align-items: center;
                margin: 0 auto 0.2em auto;
                padding-bottom:0.9em;
               
            }
            .status {
                display: inline-flex;
                align-items: center;
              
              
            }
            .status-tick {
                display: inline-block;
                width: 1.1em;
                height: 1.1em;
                padding-right:0.2em;
          
            }
            .status-online {
                background: var(--accent);
            }
            .status-offline {
                background:rgb(126, 80, 78); /* Red color for offline */
            }

            @media (max-width: 700px) {
                main {
                    max-width: 99vw;
                    padding: 18px 1vw;
                    gap: 16px;
                }
                h1 {
                    font-size: 1.5rem;
                }
            }
            @media (min-width: 900px) {
                main {
                    width: 60vw;
                    max-width: 600px;
                    padding: 64px 56px 48px 56px;
                }
                h1 {
                    font-size: 2.4rem;
                }
            }
            @media (min-width: 1200px) {
                main {
                    width: 40vw;
                    max-width: 800px;
                    padding: 72px 80px 56px 80px;
                }
                h1 {
                    font-size: 2.8rem;
                }
            }
            @media (min-width: 1600px) {
                main {
                    width: 32vw;
                    max-width: 900px;
                    padding: 84px 120px 72px 120px;
                }
                h1 {
                    font-size: 3.2rem;
                }
            }
            .endpoints {
                display: flex;
                flex-direction: column;
                gap: 14px;
                margin: 18px 0 12px 0;
                align-items: center;
            }
            .endpoint-link {
                display: block;
                background: #5b8ca6;
                color: #fff;
                text-decoration: none;
                padding: 12px 0;
                border-radius: 8px;
                font-size: 1.06rem;
                font-weight: 500;
                border: 1.5px solid #446a7c;
                box-shadow: 0 1.5px 6px rgba(30,60,90,0.07);
                transition: 1s ease-in-out;
                width: 100%;
                max-width: 520px;
                text-align: center;
                letter-spacing: 0.5px;
                cursor: pointer;
            }
            .endpoint-link:hover, .endpoint-link:focus {
                background: #22496a;
                color: #fff;
                box-shadow: 0 4px 16px rgba(1,25,75,0.14);
                outline: none;
                
            }
            h1 {
                font-size: 2.4rem;
                font-weight: 700;
                letter-spacing: 1px;
                text-align: center;
            }

            h6 {
            text-align:right;
            font-style:italic;
            font-weight:normal;
            margin-top:0;
            margin-right:50px;
            color:var(--text-muted);
            }

            .status {
                display: inline-block;
                color: #fff; /* Removed background here to be set dynamically */
                border-radius: 8px;
                padding: 8px 16px;
                font-size: 1.1rem;
                font-weight: 600;
                margin-left: 10px;
                letter-spacing: 0.5px;
                box-shadow: 0 2px 8px rgba(79,138,139,0.12);
                position: relative;
            }
            section.info {
                margin-bottom: 16px;
            }
            .info-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            .info-list li {
                margin-bottom: 10px;
                font-size: 1.1rem;
                color: var(--text-main);
            }
            .info-label {
                color: var(--text-muted);
                font-weight: 500;
                margin-right: 8px;
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
            .endpoints {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin: 18px 0 12px 0;
            }
            .endpoint-link {
                display: inline-block;
                background: var(--accent);
                color: #fff;
                text-decoration: none;
                padding: 10px 18px;
                border-radius: 8px;
                font-size: 1.04rem;
                font-weight: 500;
                box-shadow: 0 2px 8px rgba(79,138,139,0.06);
                transition: background 0.2s, color 0.2s, box-shadow 0.2s;
                border: none;
            }
            .endpoint-link:hover, .endpoint-link:focus {
                background: var(--accent2);
                color: #fff;
                box-shadow: 0 4px 16px rgba(255,92,88,0.14);
                outline: none;
            }
            .logs-link {
                color: var(--accent);
                text-decoration: underline;
                font-weight: 500;
                transition: color 0.2s;
                
            }
            .logs-link:hover, .logs-link:focus {
                color: var(--accent2);
            }
            .note {
                color: var(--text-muted);
                font-size: 0.98rem;
                margin-top: 18px;
                text-align: center;
            }
        </style>
        <main>
            <section class="info-sticky">
              <h6 cy-data="server_version">Mock LLM Server</h6>
                <h1>Mock LLM Server</h1>
                <div class="status-box" cy-data="server_status">
                    <span class="status" id="server-status">
                        <span class="status-tick" id="status-icon" aria-label="running" title="Running">
                            <!-- SVG will be dynamically updated here -->
                        </span>
                        <span id="status-text">Checking...</span>
                        <span class="running-dots"></span>
                    </span>
                </div>
                <ul class="info-list">
                    <li><span class="info-label" cy-data="server_address">Server Address:</span><span class="highlight" cy-data="server_address">localhost</span></li>
                    <li><span class="info-label" cy-data="server_port">Server Port:</span><span class="highlight" cy-data="server_port">${process.env?.SERVER_PORT?.toUpperCase() ?? 'NONE'}</span></li>
                    <li><span class="info-label" cy-data="server_url">Server URL:</span><span class="highlight" cy-data="server_url">${process.env?.LLM_URL_ENDPOINT?.toUpperCase() ?? 'NONE'}</span></li>
                    <li><span class="info-label" cy-data="llm_template">LLM Template:</span><span class="highlight" cy-data="llm_template">${process.env?.LLM_NAME?.toUpperCase() ?? 'NONE'}</span></li>
                    <li><span class="info-label" cy-data="response_type">Response Type:</span><span class="highlight" cy-data="response_type">${process.env.MOCK_LLM_RESPONSE_TYPE?.toUpperCase() ?? 'NONE'}</span></li>
                    ${process.env.MOCK_LLM_RESPONSE_TYPE === 'lorem' ? `<li><span class="info-label">Maximum sentences:</span><span class="highlight">${process.env?.MAX_LOREM_PARAS ?? 'NONE'}</span></li>` : ''}
                    ${process.env.MOCK_LLM_RESPONSE_TYPE === 'stored' ? `<li><span class="info-label">Total Stored Responses:</span><span class="highlight">${dbEntries ?? 0}</span></li>` : ''}
                    <li><span class="info-label" cy-data="validation">LLM Request Validation:</span><span class="highlight" cy-data="validation">${process.env?.VALIDATE_REQUESTS?.toUpperCase() ?? 'NONE'}</span></li>
                    <li><span class="info-label" cy-data="logging">Http Request Log:</span><span class="highlight" cy-data="logging">${process.env?.LOG_REQUESTS?.toUpperCase() ?? 'NONE'}</span></li>
                    <li><span class="info-label" cy-data="debug">Debug Mode:</span><span class="highlight" cy-data="debug">${process.env.DEBUG === '*' ? 'ON' : 'OFF'}</span></li>
                    <li><span class="info-label">Response Delay Min:</span><span class="highlight">${process.env?.RESPONSE_DELAY_MIN || '0'}ms</span></li>
                    <li><span class="info-label">Response Delay Max:</span><span class="highlight">${process.env?.RESPONSE_DELAY_MAX || '0'}ms</span></li>
                    <li><span class="info-label">Delay Status:</span><span class="highlight">${parseInt(process.env?.RESPONSE_DELAY_MIN || '0') > 0 || parseInt(process.env?.RESPONSE_DELAY_MAX || '0') > 0 ? 'ENABLED' : 'DISABLED'}</span></li>
                </ul>
            </section>
            <section>
                <div style="margin-bottom: 8px; font-size: 1.13rem; color: var(--text-muted); font-weight: 600;" cy-data="server_label">API endpoint (GET & POST)</div>
                <div class="endpoints">
                    <!--ENDPOINT_LINKS_PLACEHOLDER-->
                </div>
            </section>
            <section>
                <div style="margin-bottom: 6px; font-size: 1.13rem; color: var(--text-muted); font-weight: 600;">Logs URL:&nbsp; <span><a class="logs-link" href="/logs">localhost:${process.env?.SERVER_PORT}/logs</a> </span></div>
                
            </section>
            <div class="note">
                Modify settings in .env file and restart server.<br/>
                LOG_REQUESTS and VALIDATE_REQUESTS must be 'ON' to log POST requests.
            </div>
        </main>
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            var dots = document.querySelector('.running-dots');
            let dotsInterval = null; // Declare dotsInterval here

            const statusIcon = document.getElementById('status-icon');
            const statusText = document.getElementById('status-text');
            const serverStatus = document.getElementById('server-status');
           
            const onlineSvg = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="#2ecc40"/><path d="M6 10.5l3 3 5-6.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            const offlineSvg = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#ff4136"/><path d="M15 9L9 15M9 9L15 15" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
           
            async function checkServerStatus() {
                try {
                    const response = await fetch('/ping'); // Assuming a /ping endpoint for status
                    if (response.ok) {
                        statusIcon.innerHTML = onlineSvg;
                        statusText.textContent = 'Running';
                        serverStatus.classList.remove('status-offline');
                        serverStatus.classList.add('status-online');
                        if (dots) {
                            dots.style.display = 'inline-block'; // Show dots
                            if (!dotsInterval) { // Start animation only if not already running
                                let count = 1, step = 1;
                                dotsInterval = setInterval(() => {
                                    dots.textContent = '.'.repeat(count);
                                    count += step;
                                    if (count === 3 || count === 1) step *= -1;
                                }, 300);
                            }
                        }
                    } else {
                        throw new Error('Server not OK');
                    }
                } catch (error) {
                    statusIcon.innerHTML = offlineSvg;
                    statusText.textContent = 'Not Running';
                    serverStatus.classList.remove('status-online');
                    serverStatus.classList.add('status-offline');
                    if (dots) {
                        if (dotsInterval) { // Stop animation if running
                            clearInterval(dotsInterval);
                            dotsInterval = null;
                        }
                        dots.textContent = ''; // Clear dots
                        dots.style.display = 'none'; // Hide dots
                    }
                }
            }
           
            // Initial check
            checkServerStatus();
           
            // Check every 2 seconds
            setInterval(checkServerStatus, 2000);
        });
        </script>
    </body>
    </html>
    `;

function serverPage(app: FastifyInstance, apiPaths: string[]) {
	// UI meta endpoint for the compiled Svelte dashboard
	app.get('/ui-meta', async (request, reply) => {
		const dbEntries = db.llm.getAll()?.length ?? 0;
		const storedResponsesCount =
			process.env.MOCK_LLM_RESPONSE_TYPE === 'stored' ? dbEntries : null;

		const responseDelayMinMs = Number(process.env?.RESPONSE_DELAY_MIN ?? 0) || 0;
		const responseDelayMaxMs = Number(process.env?.RESPONSE_DELAY_MAX ?? 0) || 0;
		const delayStatus =
			responseDelayMinMs > 0 || responseDelayMaxMs > 0 ? 'ENABLED' : 'DISABLED';

		const apiLinks = apiPaths.map(() => ({
			href: `/${prefix}`,
			label: `/${prefix}`,
		}));

		return reply.send({
			serverPort: Number(process.env?.SERVER_PORT ?? '') || null,
			llmUrlEndpoint: process.env?.LLM_URL_ENDPOINT ?? '',
			llmName: process.env?.LLM_NAME ?? '',
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
			apiLinks,
		});
	});

	// Home page route
	app.get('/', async (request, reply) => {
		const uiIndex = tryReadUiDistFile('index.html');
		if (uiIndex) {
			return reply
				.type(contentTypeForPath(uiIndex.absPath))
				.send(uiIndex.data);
		}

		const dbEntries = db.llm.getAll()?.length ?? 1;
		const endpointLinks = apiPaths
			.map(
				() =>
					`<a class="endpoint-link" cy-data="endpoint" href="/${prefix}">/${prefix}</a>`,
			)
			.join('');
		const htmlContent = htmlString(dbEntries - 1).replace(
			'<!--ENDPOINT_LINKS_PLACEHOLDER-->',
			endpointLinks,
		);
		return reply.type('text/html').send(htmlContent);
	});

	// Ping endpoint for status check
	app.get('/ping', async (request, reply) => {
		return reply.send({ response: 'server is running' });
	});

	// Serve built Vite assets when present
	app.get('/assets/*', async (request, reply) => {
		const star = (request.params as Record<string, string> | undefined)?.['*'] ?? '';
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
