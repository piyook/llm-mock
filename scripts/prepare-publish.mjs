// `npm run prep`: gets llmock and create-llmock ready to publish, in one go.
//
//   1. checks both packages, their lockfiles and the template's `llmock`
//      dependency all name the same version
//   2. builds the dashboard (ui/dist is not committed, but is shipped)
//   3. packs both packages into .npm-publish/ and checks what went in
//   4. installs the llmock tarball in a scratch folder and starts and stops it
//      (skip with `npm run prep -- --no-smoke`)
//
// Nothing is published: it ends by printing the two `npm publish` commands.
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const createDir = path.join(root, 'create-llmock');
const outDir = path.join(root, '.npm-publish');
const smoke = !process.argv.includes('--no-smoke');

const fail = (message) => {
	console.error(`\n✗ ${message}`);
	process.exit(1);
};
const step = (message) => console.log(`\n▶ ${message}`);
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const run = (command, cwd = root, stdio = 'inherit') => execSync(command, { cwd, stdio });
// Runs a command line and returns its status and output, without throwing
const capture = (command, cwd) =>
	spawnSync(command, { cwd, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

// 1. Versions
step('Checking versions');
const llmock = readJson('package.json');
const create = readJson('create-llmock/package.json');
const version = llmock.version;
const found = {
	'package.json': llmock.version,
	'package-lock.json': readJson('package-lock.json').packages[''].version,
	'create-llmock/package.json': create.version,
	'create-llmock/package-lock.json': readJson('create-llmock/package-lock.json').packages[''].version,
	'create-llmock/templates/package.json (llmock dependency)': readJson(
		'create-llmock/templates/package.json',
	).dependencies?.llmock?.replace(/^\^/, ''),
};
const wrong = Object.entries(found).filter(([, v]) => v !== version);
if (wrong.length > 0) {
	fail(
		`Versions differ from package.json (${version}):\n${wrong
			.map(([file, v]) => `  ${file}: ${v ?? 'missing'}`)
			.join('\n')}\nBump them all to the same version (and run npm install in each folder).`,
	);
}
console.log(`  all at ${version}`);

// 2. Dashboard
step('Building the dashboard (ui/dist)');
try {
	run('npm --prefix ui run build');
} catch {
	fail('The dashboard build failed. Has `npm install` been run in ui/?');
}

// 3. Pack both, and check the file lists
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);

const pack = (name, cwd, mustHave, mustNotHave = []) => {
	step(`Packing ${name}`);
	const result = capture(`npm pack --json --pack-destination "${outDir}"`, cwd);
	if (result.status !== 0) fail(`npm pack failed for ${name}:\n${result.stderr}`);
	// Lifecycle scripts may print before the JSON, so read from its start
	const [info] = JSON.parse(result.stdout.slice(result.stdout.indexOf('[')));
	const files = new Set(info.files.map((f) => f.path));
	const missing = mustHave.filter((f) => !files.has(f));
	const extra = mustNotHave.filter((f) => files.has(f));
	if (missing.length > 0) fail(`${info.filename} is missing: ${missing.join(', ')}`);
	if (extra.length > 0) fail(`${info.filename} should not contain: ${extra.join(', ')}`);
	console.log(`  ${info.filename}: ${info.entryCount} files, ${(info.size / 1024).toFixed(0)} kB`);
	return path.join(outDir, info.filename);
};

const llmockTgz = pack(
	'llmock',
	root,
	['package.json', 'README.md', 'LICENSE', 'llms.txt', 'bin/llmock.js', 'src/index.ts', 'src/server.ts', 'scripts/postinstall.mjs', 'ui/dist/index.html'],
	['scripts/prepare-publish.mjs'],
);
const createTgz = pack('create-llmock', createDir, [
	'package.json',
	'README.md',
	'bin/create-llmock.js',
	'templates/package.json',
	'templates/.llmockrc.json',
]);

// 4. Smoke test: install the tarball and start and stop the server
if (smoke) {
	step('Smoke test: installing the llmock tarball in a scratch folder');
	const scratch = mkdtempSync(path.join(os.tmpdir(), 'llmock-prep-'));
	try {
		run('npm init -y', scratch, 'ignore');
		run(`npm install --no-audit --no-fund --silent "${llmockTgz}"`, scratch);
		const start = capture('npx llmock start --port=0', scratch);
		const port = /Server is running at: http:\/\/[^:]+:(\d+)/.exec(start.stdout)?.[1];
		if (start.status !== 0 || !port) fail(`llmock did not start:\n${start.stdout}${start.stderr}`);
		const ping = await fetch(`http://127.0.0.1:${port}/ping`).catch((error) => error);
		capture(`npx llmock stop --port=${port}`, scratch);
		if (!ping.ok) fail(`llmock started on port ${port} but /ping did not answer`);
		console.log(`  started on port ${port}, /ping answered, stopped`);
	} finally {
		rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
	}
}

const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
console.log(`\n✓ llmock and create-llmock ${version} are ready. To publish:\n`);
console.log(`  npm publish ${rel(llmockTgz)}`);
console.log(`  npm publish ${rel(createTgz)}\n`);
