import { execSync } from 'child_process';

const branchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

const valid = /^(main|dev)$|^(feat|fix|hotfix|release|chore)\/.+$/.test(branchName);

if (!valid) {
  console.error(`Error: INVALID BRANCH NAME: use format 'feature|fix|hotfix|release|core/your-branch-name'`);
  process.exit(1);
}

console.log(`Validated branch name: ${branchName} - all OK :)`);

// You can set other regex patterns here such as:
// /^(feature|fix|hotfix|release)\/.+/  - branch has to start with feature/, fix/, release/ or hotfix/
// /(feature|release|hotfix)\/(JIRA-\d+)/  - it should look like feature/JIRA-1234
// /(feature|release|hotfix)\/(JIRA-\d+\/)?[a-z-]+/  - it should look like feature/branch-name or include JIRA's code like feature/JIRA-1234/branch-name
