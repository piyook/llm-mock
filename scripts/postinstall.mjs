import { existsSync } from 'fs';
import { execSync } from 'child_process';

// Only run UI install in development mode (when package.json exists in parent)
if (existsSync('ui') && existsSync('package.json')) {
  console.log(' Installing UI dependencies...');
  try {
    execSync('npm --prefix ui install', { stdio: 'inherit' });
  } catch {
    console.log(' UI install failed, continuing...');
  }
} else {
  console.log(' Skipping UI install (production mode or no UI directory)');
}
