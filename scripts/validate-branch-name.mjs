import { execSync } from 'node:child_process';

// Branches to check, in order of preference:
// - args: the pre-push hook passes the branches being pushed.
// - GITHUB_HEAD_REF: on PRs, Actions checks out a detached HEAD, so use the PR's source branch.
// - otherwise the checked-out branch (manual `npm run validate-branch-name`).
const args = process.argv.slice(2);
const branchNames = args.length
	? args
	: [
			process.env.GITHUB_HEAD_REF ||
				execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
		];

const invalid = branchNames.filter(
	(name) => !/^(main|dev)$|^(feat|fix|hotfix|release|chore)\/.+$/.test(name),
);

if (invalid.length) {
	for (const name of invalid) {
		console.error(
			`Error: INVALID BRANCH NAME '${name}': use format 'feat|fix|hotfix|release|chore/your-branch-name'`,
		);
	}
	process.exit(1);
}

console.log(`Validated branch name: ${branchNames.join(', ')} - all OK :)`);
