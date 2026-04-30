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
    console.log('\n📖 Edit the files in requests/ and responses/ to customize your mock responses.');
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

  // Create requests and responses directories with examples
  await createRequestsAndResponses(targetDir);
}

async function copyTemplateFiles(targetDir, projectName) {
  const templateFiles = [
    'package.json',
    '.llmockrc.json',
    'README.md'
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

async function createRequestsAndResponses(targetDir) {
  // Create directories
  await fs.mkdir(path.join(targetDir, 'requests'), { recursive: true });
  await fs.mkdir(path.join(targetDir, 'responses'), { recursive: true });

  // Copy example request and response files
  const examples = [
    { file: 'openai-chat.json', dir: 'requests' },
    { file: 'openai-chat-response.json', dir: 'responses' },
    { file: 'gemini-chat.json', dir: 'requests' },
    { file: 'gemini-chat-response.json', dir: 'responses' }
  ];

  for (const example of examples) {
    const templatePath = path.join(templatesDir, 'examples', example.file);
    const targetPath = path.join(targetDir, example.dir, example.file);
    
    try {
      const content = await fs.readFile(templatePath, 'utf-8');
      await fs.writeFile(targetPath, content);
    } catch (error) {
      // If template doesn't exist, create a basic example
      if (example.dir === 'requests') {
        const basicRequest = createBasicRequest(example.file);
        await fs.writeFile(targetPath, JSON.stringify(basicRequest, null, 2));
      } else {
        const basicResponse = createBasicResponse(example.file);
        await fs.writeFile(targetPath, JSON.stringify(basicResponse, null, 2));
      }
    }
  }
}

function createBasicRequest(filename) {
  if (filename.includes('openai')) {
    return [
      {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: "Hello, how are you?"
          }
        ],
        temperature: 1,
        n: 1,
        stream: false
      }
    ];
  } else if (filename.includes('gemini')) {
    return [
      {
        contents: [
          {
            parts: [
              {
                text: "Hello, how are you?"
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 1,
          maxOutputTokens: 1000
        }
      }
    ];
  }
}

function createBasicResponse(filename) {
  if (filename.includes('openai')) {
    return [
      {
        id: "chatcmpl-example",
        object: "chat.completion",
        created: Date.now(),
        model: "gpt-4o",
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        },
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello! I'm doing well, thank you for asking. How can I help you today?"
            },
            finish_reason: "stop",
            index: 0
          }
        ]
      }
    ];
  } else if (filename.includes('gemini')) {
    return [
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Hello! I'm doing well, thank you for asking. How can I help you today?"
                }
              ],
              role: "model"
            },
            finishReason: "STOP",
            index: 0
          }
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30
        }
      }
    ];
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

init().catch(console.error);
