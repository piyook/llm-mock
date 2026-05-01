import { execSync, spawn } from "child_process";
import http from "http";

const suites = [
  { start: "llmock:start:chatgpt",   spec: "cypress/e2e/gpt-mock-spec.cy.ts" },
  { start: "llmock:start:gemini",    spec: "cypress/e2e/gemini-mock-spec.cy.ts" },
  { start: "llmock:start:streaming", spec: "cypress/e2e/streaming-only-spec.cy.ts" },
  { start: "llmock:start:embeddings",spec: "cypress/e2e/embeddings-spec.cy.ts" },
];

const cypress = (spec) => execSync(`npx cypress run --spec "${spec}"`, { stdio: "inherit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const startServer = (npmScript) => {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', npmScript], {
      stdio: 'inherit',
      env: { ...process.env, CONFIG_PATH: '.llmockrc.test.json', E2E_MODE: 'true' },
      shell: true,
      detached: true, // Create new process group
    });

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== null && code !== 0 && code !== 143 && code !== 1) {
        reject(new Error(`Server process exited early with code ${code}`));
      }
    });

    // resolve immediately — healthCheck will wait for readiness
    resolve(proc);
  });
};

const waitForPortFree = async (port = 8001, maxAttempts = 20) => {
  for (let i = 0; i < maxAttempts; i++) {
    const free = await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/ping',
        method: 'GET',
        timeout: 1000,
      }, () => resolve(false)); // got a response = port still in use
      req.on('error', () => resolve(true)); // connection refused = port is free
      req.on('timeout', () => { req.destroy(); resolve(true); });
      req.end();
    });

    if (free) {
      console.log(`✓ Port ${port} is free`);
      return;
    }
    console.log(`Waiting for port ${port} to be released... (${i + 1}/${maxAttempts})`);
    await sleep(1000);
  }
  throw new Error(`Port ${port} was not released after ${maxAttempts} attempts`);
};

const stopServer = (proc) => {
  return new Promise((resolve) => {
    if (!proc || proc.killed) return resolve();

    let resolved = false;
    const done = () => {
      if (!resolved) { resolved = true; resolve(); }
    };

    proc.on('exit', done);
    setTimeout(done, 5000);

    if (process.platform === 'win32') {
      try {
        // Kill the shell process tree
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } catch { /* ignore */ }
      // Also kill anything holding port 8001 directly
      try {
        execSync(
          `for /f "tokens=5" %a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do taskkill /PID %a /F`,
          { stdio: 'ignore', shell: true }
        );
      } catch { /* ignore */ }
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
          execSync('pkill -f "port.*8001" || pkill -f "tsx.*server.ts" || true', { stdio: 'ignore' });
        } catch { /* ignore */ }
      }, 3000);
    }
  });
};

const healthCheck = async (port = 8001, maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port,
          path: '/ping',
          method: 'GET',
          timeout: 2000,
        }, resolve);
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
      });
      console.log(`✓ Server API is responding on port ${port}`);
      return true;
    } catch {
      if (i === maxAttempts - 1) throw new Error(`Server failed to respond after ${maxAttempts} attempts`);
      console.log(`Waiting for server API to start... (${i + 1}/${maxAttempts})`);
      await sleep(1000);
    }
  }
};

let failed = false;
let currentProc = null;

const cleanup = async () => {
  if (currentProc) await stopServer(currentProc);
};

process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });

for (const { start, spec } of suites) {
  console.log(`\n=== Starting test suite: ${start} ===`);
  try {
    currentProc = await startServer(start);
    console.log(`✓ Server started for ${start}`);
    await healthCheck();
    console.log(`✓ Health check passed for ${start}`);
    cypress(spec);
    console.log(`✓ Cypress tests passed for ${start}`);
  } catch (e) {
    console.error(`>>> Suite FAILED: ${start}`, e.message);
    failed = true;
  } finally {
    console.log(`🛑 Stopping server for ${start}`);
  await stopServer(currentProc);
  currentProc = null;
  await waitForPortFree();
  console.log(`✓ Server stopped for ${start}`);
  }
}

console.log('\n=== All test suites completed ===');
process.exit(failed ? 1 : 0);