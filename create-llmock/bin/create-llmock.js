#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';
import { red, green, cyan, yellow } from 'kolorist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, '../templates');

async function init() {
  console.log(cyan('\n🚀 Welcome to create-llmock!\n'));

  // Get project name from command line arguments or prompt
  let projectName = process.argv[2];
  
  if (!projectName) {
    const response = await prompts({
      type: 'text',
      name: 'projectName',
      message: 'Project name:',
      initial: 'my-llmock-project',
      validate: (name) => {
        if (!name.trim()) {
          return 'Project name is required';
        }
        if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
          return 'Project name can only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      }
    });
    projectName = response.projectName;
  }

  if (!projectName) {
    console.log(red('❌ Project creation cancelled.'));
    process.exit(1);
  }

  // Validate project name
  if (!/^[a-zA-Z0-9-_]+$/.test(projectName)) {
    console.log(red('❌ Project name can only contain letters, numbers, hyphens, and underscores'));
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  try {
    await fs.access(targetDir);
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `Directory ${projectName} already exists. Overwrite?`,
      initial: false
    });

    if (!overwrite) {
      console.log(red('❌ Project creation cancelled.'));
      process.exit(1);
    }

    await fs.rm(targetDir, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, which is what we want
  }

  console.log(yellow(`📁 Creating project in ${targetDir}...`));

  try {
    await createProject(targetDir, projectName);
    console.log(green('✅ Project created successfully!'));
    console.log(cyan('\n🎉 Next steps:'));
    console.log(`   cd ${projectName}`);
    console.log('   npm install');
    console.log('   npm run llmock:start');
    console.log('\n📖 Edit the files in request-templates/ and response-templates/ to customize request validation and response shapes.');
  } catch (error) {
    console.log(red('❌ Error creating project:'), error.message);
    process.exit(1);
  }
}

async function createProject(targetDir, projectName) {
  // Create project directory
  await fs.mkdir(targetDir, { recursive: true });

  // Copy template files
  await copyTemplateFiles(targetDir, projectName);

  // Create request/response template folders with editable examples
  await createTemplates(targetDir);
}

async function copyTemplateFiles(targetDir, projectName) {
  const templateFiles = [
    'package.json',
    '.llmockrc.json',
    'README.md',
    'Dockerfile',
    'docker-compose.yml'
  ];

  for (const file of templateFiles) {
    const templatePath = path.join(templatesDir, file);
    const targetPath = path.join(targetDir, file);
    
    let content = await fs.readFile(templatePath, 'utf-8');
    
    // Replace placeholders in package.json
    if (file === 'package.json') {
      content = content.replace(/{{PROJECT_NAME}}/g, projectName);
    }
    
    await fs.writeFile(targetPath, content);
  }
}

async function createTemplates(targetDir) {
  // The server looks for <name>_req.json / <name>_res.json in these folders
  // before falling back to its built-in copies, so these are editable overrides.
  await fs.mkdir(path.join(targetDir, 'request-templates'), { recursive: true });
  await fs.mkdir(path.join(targetDir, 'response-templates'), { recursive: true });

  const providers = ['openai', 'gemini', 'claude'];

  for (const provider of providers) {
    for (const [suffix, dir] of [['req', 'request-templates'], ['res', 'response-templates']]) {
      const file = `${provider}_${suffix}.json`;
      await fs.copyFile(
        path.join(templatesDir, 'examples', file),
        path.join(targetDir, dir, file)
      );
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

init().catch(console.error);
