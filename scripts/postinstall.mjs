import { existsSync } from 'fs';
import { execSync } from 'child_process';

if (existsSync('ui')) {
  console.log('📦 Installing UI dependencies...');
  execSync('npm --prefix ui install', { stdio: 'inherit' });
} else {
  console.log('⏭️  No UI directory found, skipping UI install.');
}
