import { execSync, spawn } from 'child_process';

const args = process.argv.slice(2);
const isE2E = process.env.E2E_MODE === 'true';

console.log(' Compiling UI...');
execSync('npm run compile-ui', { stdio: 'inherit' });

console.log(' Starting llmock...');
const env = { ...process.env };

const server = spawn('node', ['./bin/llmock.js', ...args], {
  stdio: 'inherit',
  env,
  shell: false,
  detached: !isE2E,
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

if (isE2E) {
  // Stay alive so run-e2e.mjs owns the process tree
  server.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGTERM', () => server.kill('SIGTERM'));
  process.on('SIGINT', () => server.kill('SIGINT'));
} else {
  // Normal local use — detach and free the terminal
  server.unref();
}
