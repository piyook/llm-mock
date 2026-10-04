import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const script = path.resolve(
	import.meta.dirname,
	'../../../scripts/validate-branch-name.mjs',
);

const run = (...branches: string[]) =>
	spawnSync(process.execPath, [script, ...branches], { encoding: 'utf8' });

describe('validate-branch-name script', () => {
	it.each([
		'main',
		'dev',
		'feat/new-thing',
		'fix/bug',
		'hotfix/urgent',
		'release/3.9.0',
		'chore/tidy-up',
	])('accepts %s', (branch) => {
		const result = run(branch);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(branch);
	});

	it.each([
		'feature/new-thing',
		'my-branch',
		'feat/',
		'main-2',
		'core/tidy-up',
	])('rejects %s', (branch) => {
		const result = run(branch);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('INVALID BRANCH NAME');
		expect(result.stderr).toContain(branch);
	});

	it('accepts several valid branches pushed together', () => {
		const result = run('feat/one', 'fix/two');

		expect(result.status).toBe(0);
	});

	it('rejects the push when any one branch is invalid, naming only the bad one', () => {
		const result = run('feat/one', 'bad-name');

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("'bad-name'");
		expect(result.stderr).not.toContain("'feat/one'");
	});

	it('falls back to the checked out branch when no names are given', () => {
		const result = run();

		expect(result.stdout + result.stderr).toMatch(
			/Validated branch name|INVALID BRANCH NAME/,
		);
	});
});
