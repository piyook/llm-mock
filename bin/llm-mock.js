#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
let modelName = 'chatgpt'; // default model

// Parse --model argument
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--model=')) {
    modelName = args[i].split('=')[1];
  } else if (args[i] === '--model' && i + 1 < args.length) {
    modelName = args[i + 1];
  }
}

// Load configuration
async function loadConfig() {
  const configPath = resolve(process.cwd(), '.llm-mock-rc.json');
  
  if (!existsSync(configPath)) {
    console.error('Error: .llm-mock-rc.json not found in current directory');
    process.exit(1);
  }

  try {
    const fs = await import('fs');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Validate model exists
    if (!config.models[modelName]) {
      console.error(`Error: Model "${modelName}" not found in configuration`);
      console.error(`Available models: ${Object.keys(config.models).join(', ')}`);
      process.exit(1);
    }

    return { config, modelName };
  } catch (error) {
    console.error('Error parsing .llm-mock-rc.json:', error.message);
    process.exit(1);
  }
}

// Set environment variables based on configuration
function setEnvironmentVariables(config, modelName) {
  const modelConfig = config.models[modelName];
  const serverConfig = config.server;

  // Pass the selected model name to the server
  process.env.LLM_MODEL_NAME = modelName;

  // Server settings
  process.env.SERVER_PORT = serverConfig.port.toString();
  process.env.LLM_URL_ENDPOINT = modelConfig.endpoint;
  
  // LLM settings
  process.env.LLM_NAME = modelConfig.name;
  process.env.LLM_MODEL = modelConfig.model;
  process.env.MOCK_LLM_RESPONSE_TYPE = modelConfig.responseType;
  process.env.MAX_LOREM_PARAS = modelConfig.maxLoremParas.toString();
  
  // Feature flags
  process.env.VALIDATE_REQUESTS = modelConfig.validateRequests ? 'ON' : 'OFF';
  process.env.LOG_REQUESTS = modelConfig.logRequests ? 'ON' : 'OFF';
  process.env.DEBUG = modelConfig.debug ? '*' : 'OFF';
  process.env.STREAM = modelConfig.stream ? 'true' : 'false';
  
  // Response delays
  process.env.RESPONSE_DELAY_MIN = modelConfig.responseDelay.min.toString();
  process.env.RESPONSE_DELAY_MAX = modelConfig.responseDelay.max.toString();
  
  // Embeddings
  process.env.ENABLE_EMBEDDINGS_MOCK = modelConfig.embeddings.enabled ? 'true' : 'false';
  process.env.EMBEDDING_DIMENSION = modelConfig.embeddings.dimensions.toString();
}

// Main execution
async function main() {
  try {
    const { config, modelName: selectedModel } = await loadConfig();
    setEnvironmentVariables(config, selectedModel);
    
    console.log(`Starting LLM Mock Server with model: ${selectedModel}`);
    console.log(`Configuration loaded from: .llm-mock-rc.json`);
    
    // Import and start the server using tsx for TypeScript support
    const { exec } = await import('child_process');
    
    const serverPath = resolve(__dirname, '../src/server.ts');
    
    // Use tsx to run TypeScript server
    const serverProcess = exec(`npx tsx "${serverPath}"`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    // Handle process exit
    serverProcess.on('exit', (code) => {
      process.exit(code || 0);
    });
    
    serverProcess.on('error', (error) => {
      console.error('Failed to start server process:', error.message);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

main();
