import { execSync, spawn } from 'child_process';

const args = process.argv.slice(2);
const isE2E = process.env.E2E_MODE === 'true';

console.log(' Compiling UI...');
execSync('npm run compile-ui', { stdio: 'inherit' });

console.log(' Starting llmock...');
const env = { ...process.env };

// bin/llmock.js detaches the real server itself (or stays attached in E2E
// mode), so this wrapper never needs to be detached. Detaching it would open
// a console window on Windows.
const server = spawn('node', ['./bin/llmock.js', ...args], {
  stdio: 'inherit',
  env,
  shell: false,
  windowsHide: true,
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Normal use: the CLI exits about a second after detaching the server, so
// this returns and frees the terminal. E2E: stay alive so run-e2e.mjs owns
// the process tree.
server.on('exit', (code) => process.exit(code ?? 0));

if (isE2E) {
  process.on('SIGTERM', () => server.kill('SIGTERM'));
  process.on('SIGINT', () => server.kill('SIGINT'));
}
