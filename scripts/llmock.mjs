import { execSync } from 'child_process';

const args = process.argv.slice(2).join(' ');

console.log(' Compiling UI...');
execSync('npm run compile-ui', { stdio: 'inherit' });

console.log(' Starting llmock...');
execSync(`node ./bin/llmock.js ${args}`, { stdio: 'inherit' });
