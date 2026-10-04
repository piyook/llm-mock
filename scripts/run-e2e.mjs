import { execSync, spawn } from 'node:child_process';
import http from 'node:http';

const suites = [
	{ start: 'llmock:start:chatgpt', spec: 'cypress/e2e/gpt-mock-spec.cy.ts' },
	{
		start: 'llmock:start:gemini',
		spec: 'cypress/e2e/gemini-mock-spec.cy.ts',
	},
	{
		start: 'llmock:start:streaming',
		spec: 'cypress/e2e/streaming-only-spec.cy.ts',
	},
	{
		start: 'llmock:start:embeddings',
		spec: 'cypress/e2e/embeddings-spec.cy.ts',
	},
	{
		start: 'llmock:start:claude',
		spec: 'cypress/e2e/claude-mock-spec.cy.ts',
	},
	{
		start: 'llmock:start:stored',
		spec: 'cypress/e2e/stored-responses-spec.cy.ts',
	},
	{ start: 'llmock:start:chaos', spec: 'cypress/e2e/chaos-spec.cy.ts' },
];

// By default only a one-line result per suite is printed, and the full server
// and Cypress output of a suite is shown only if it fails. E2E_VERBOSE=true
// prints everything as it happens (used in CI).
const verbose = process.env.E2E_VERBOSE === 'true';
const childStdio = verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'];
const log = (...args) => {
	if (verbose) console.log(...args);
};

// Collects a child's piped output; returns a function giving the text so far.
// Empty in verbose mode, where the output goes straight to the terminal.
const capture = (proc) => {
	const chunks = [];
	proc.stdout?.on('data', (chunk) => chunks.push(chunk));
	proc.stderr?.on('data', (chunk) => chunks.push(chunk));
	return () => Buffer.concat(chunks).toString();
};

// Runs asynchronously so the server's piped output keeps being drained
const cypress = (spec) => {
	return new Promise((resolve, reject) => {
		const proc = spawn(`npx cypress run --spec "${spec}"`, {
			stdio: childStdio,
			shell: true,
			windowsHide: true,
		});
		const output = capture(proc);

		proc.on('error', reject);
		proc.on('close', (code) => resolve({ code, output: output() }));
	});
};

// Test counts from the results box Cypress prints, undefined if not found
const cypressCount = (output, label) => {
	const match = new RegExp(`│\\s*${label}:\\s+(\\d+)`).exec(output);
	return match ? Number(match[1]) : undefined;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const startServer = (npmScript) => {
	return new Promise((resolve, reject) => {
		const proc = spawn(`npm run ${npmScript}`, {
			stdio: childStdio,
			env: {
				...process.env,
				CONFIG_PATH: '.llmockrc.test.json',
				E2E_MODE: 'true',
			},
			shell: true,
			// A new process group lets us kill the tree on Unix. On Windows
			// `detached` opens a console window, and taskkill /T covers the tree.
			detached: process.platform !== 'win32',
			windowsHide: true,
		});
		proc.output = capture(proc);

		proc.on('error', reject);
		proc.on('exit', (code) => {
			if (code !== null && code !== 0 && code !== 143 && code !== 1) {
				reject(
					new Error(`Server process exited early with code ${code}`),
				);
			}
		});

		// resolve immediately — healthCheck will wait for readiness
		resolve(proc);
	});
};

const waitForPortFree = async (port = 8001, maxAttempts = 20) => {
	for (let i = 0; i < maxAttempts; i++) {
		const free = await new Promise((resolve) => {
			const req = http.request(
				{
					hostname: 'localhost',
					port,
					path: '/ping',
					method: 'GET',
					timeout: 1000,
				},
				() => resolve(false),
			); // got a response = port still in use
			req.on('error', () => resolve(true)); // connection refused = port is free
			req.on('timeout', () => {
				req.destroy();
				resolve(true);
			});
			req.end();
		});

		if (free) {
			log(`✓ Port ${port} is free`);
			return;
		}
		log(
			`Waiting for port ${port} to be released... (${i + 1}/${maxAttempts})`,
		);
		await sleep(1000);
	}
	throw new Error(
		`Port ${port} was not released after ${maxAttempts} attempts`,
	);
};

const stopServer = (proc) => {
	return new Promise((resolve) => {
		if (!proc || proc.killed) return resolve();

		let resolved = false;
		const done = () => {
			if (!resolved) {
				resolved = true;
				resolve();
			}
		};

		proc.on('exit', done);
		setTimeout(done, 5000);

		if (process.platform === 'win32') {
			try {
				// Kill the shell process tree
				execSync(`taskkill /pid ${proc.pid} /T /F`, {
					stdio: 'ignore',
				});
			} catch {
				/* ignore */
			}
			// Also kill anything holding port 8001 directly
			try {
				execSync(
					`for /f "tokens=5" %a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do taskkill /PID %a /F`,
					{ stdio: 'ignore', shell: true },
				);
			} catch {
				/* ignore */
			}
		} else {
			// On Linux/Unix, kill the entire process group
			try {
				// Kill the entire process group to ensure all child processes are killed
				process.kill(-proc.pid, 'SIGTERM');
			} catch {
				// Fallback to regular kill if process group kill fails
				proc.kill('SIGTERM');
			}

			// Wait a bit and then force kill if still alive
			setTimeout(() => {
				if (!proc.killed) {
					try {
						process.kill(-proc.pid, 'SIGKILL');
					} catch {
						proc.kill('SIGKILL');
					}
				}

				// Fallback: kill any process using port 8001 directly
				try {
					execSync(
						'pkill -f "port.*8001" || pkill -f "tsx.*server.ts" || true',
						{ stdio: 'ignore' },
					);
				} catch {
					/* ignore */
				}
			}, 3000);
		}
	});
};

const healthCheck = async (port = 8001, maxAttempts = 30) => {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await new Promise((resolve, reject) => {
				const req = http.request(
					{
						hostname: 'localhost',
						port,
						path: '/ping',
						method: 'GET',
						timeout: 2000,
					},
					resolve,
				);
				req.on('error', reject);
				req.on('timeout', () => {
					req.destroy();
					reject(new Error('timeout'));
				});
				req.end();
			});
			log(`✓ Server API is responding on port ${port}`);
			return true;
		} catch {
			if (i === maxAttempts - 1)
				throw new Error(
					`Server failed to respond after ${maxAttempts} attempts`,
				);
			log(`Waiting for server API to start... (${i + 1}/${maxAttempts})`);
			await sleep(1000);
		}
	}
};

let failedSuites = 0;
let totalTests = 0;
let currentProc = null;

const cleanup = async () => {
	if (currentProc) await stopServer(currentProc);
};

process.on('SIGINT', async () => {
	await cleanup();
	process.exit(130);
});
process.on('SIGTERM', async () => {
	await cleanup();
	process.exit(143);
});

for (const { start, spec } of suites) {
	const name = start.split(':').pop();
	let cypressOutput = '';
	let error = null;

	log(`\n=== Starting test suite: ${start} ===`);
	try {
		currentProc = await startServer(start);
		log(`✓ Server started for ${start}`);
		await healthCheck();
		log(`✓ Health check passed for ${start}`);
		const result = await cypress(spec);
		cypressOutput = result.output;
		if (result.code !== 0)
			throw new Error(`Cypress exited with code ${result.code}`);
	} catch (e) {
		error = e;
		failedSuites++;
	} finally {
		log(`🛑 Stopping server for ${start}`);
		const serverOutput = currentProc?.output() ?? '';
		await stopServer(currentProc);
		currentProc = null;
		await waitForPortFree();
		log(`✓ Server stopped for ${start}`);

		const passing = cypressCount(cypressOutput, 'Passing');
		const failing = cypressCount(cypressOutput, 'Failing');
		totalTests += cypressCount(cypressOutput, 'Tests') ?? 0;

		if (error) {
			const counts =
				passing === undefined
					? ''
					: `  ${passing} passed, ${failing} failed`;
			console.error(`✗ ${name}${counts}  (${error.message})`);
			if (serverOutput)
				console.error(
					`\n--- ${name}: server output ---\n${serverOutput}`,
				);
			if (cypressOutput)
				console.error(
					`\n--- ${name}: Cypress output ---\n${cypressOutput}`,
				);
		} else {
			console.log(
				`✓ ${name}${passing === undefined ? '' : `  ${passing} passed`}`,
			);
		}
	}
}

const passedSuites = suites.length - failedSuites;
const tests = totalTests > 0 ? ` (${totalTests} tests)` : '';
console.log(
	`\n=== ${passedSuites} of ${suites.length} suites passed${tests} ===`,
);
process.exit(failedSuites > 0 ? 1 : 0);
