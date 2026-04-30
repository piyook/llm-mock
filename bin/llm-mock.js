#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
let modelName = 'chatgpt'; // default model
let showHelp = false;
let showConfig = false;
let customSettings = {};

// Available command line options
const availableOptions = {
  'model': 'Model preset to use (chatgpt, gemini, streaming, embeddings)',
  'port': 'Server port (default: 8001)',
  'host': 'Server host (default: 0.0.0.0)',
  'endpoint': 'LLM endpoint path',
  'responseType': 'Response type (lorem, static)',
  'maxLoremParas': 'Maximum lorem ipsum paragraphs',
  'validateRequests': 'Validate incoming requests (true/false)',
  'logRequests': 'Log incoming requests (true/false)',
  'debug': 'Enable debug mode (true/false)',
  'stream': 'Enable streaming responses (true/false)',
  'delayMin': 'Minimum response delay in milliseconds',
  'delayMax': 'Maximum response delay in milliseconds',
  'embeddings': 'Enable embeddings mock (true/false)',
  'embeddingDimensions': 'Embedding vector dimensions'
};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--help' || arg === '-h') {
    showHelp = true;
  } else if (arg === '--config' || arg === '-c') {
    showConfig = true;
  } else if (arg.startsWith('--model=')) {
    modelName = arg.split('=')[1];
  } else if (arg === '--model' && i + 1 < args.length) {
    modelName = args[i + 1];
    i++; // Skip next argument
  } else if (arg.startsWith('--')) {
    // Parse --key=value format
    const equalIndex = arg.indexOf('=');
    if (equalIndex > 0) {
      const key = arg.substring(2, equalIndex);
      const value = arg.substring(equalIndex + 1);
      customSettings[key] = value;
    } else if (i + 1 < args.length) {
      // Parse --key value format
      const key = arg.substring(2);
      customSettings[key] = args[i + 1];
      i++; // Skip next argument
    }
  }
}

// Show help information
function showHelpInfo() {
  console.log(`
LLM Mock Server - A configurable mock LLM API server

USAGE:
  llm-mock [options]

OPTIONS:
  --help, -h              Show this help message
  --config, -c            Show current configuration settings
  --model=<name>          Model preset to use (chatgpt, gemini, streaming, embeddings)
  --port=<number>         Server port (default: 8001)
  --host=<address>        Server host (default: 0.0.0.0)
  --endpoint=<path>       LLM endpoint path
  --responseType=<type>   Response type (lorem, static)
  --maxLoremParas=<num>    Maximum lorem ipsum paragraphs
  --validateRequests=<bool> Validate incoming requests (true/false)
  --logRequests=<bool>    Log incoming requests (true/false)
  --debug=<bool>          Enable debug mode (true/false)
  --stream=<bool>          Enable streaming responses (true/false)
  --delayMin=<ms>          Minimum response delay in milliseconds
  --delayMax=<ms>          Maximum response delay in milliseconds
  --embeddings=<bool>      Enable embeddings mock (true/false)
  --embeddingDimensions=<num> Embedding vector dimensions

EXAMPLES:
  llm-mock                                    # Start with default chatgpt model
  llm-mock --model=gemini                     # Use gemini model preset
  llm-mock --port=3000 --host=localhost       # Custom server settings
  llm-mock --debug=true --stream=true         # Enable debug and streaming
  llm-mock --delayMin=1000 --delayMax=2000    # Custom response delays

For more information, visit: https://github.com/piyook/llm-mock
`);
}

// Show current configuration
function showCurrentConfig(config, selectedModel) {
  const modelConfig = config.models[selectedModel];
  const serverConfig = config.server;
  
  console.log(`
Current LLM Mock Server Configuration:

SERVER:
  Host: ${serverConfig.host}
  Port: ${serverConfig.port}

MODEL: ${selectedModel}
  LLM Name: ${modelConfig.name}
  Model: ${modelConfig.model}
  Endpoint: ${modelConfig.endpoint}
  Response Type: ${modelConfig.responseType}
  Max Lorem Paragraphs: ${modelConfig.maxLoremParas}
  Validate Requests: ${modelConfig.validateRequests}
  Log Requests: ${modelConfig.logRequests}
  Debug: ${modelConfig.debug}
  Stream: ${modelConfig.stream}
  Response Delay: ${modelConfig.responseDelay.min}ms - ${modelConfig.responseDelay.max}ms
  Embeddings Enabled: ${modelConfig.embeddings.enabled}
  Embedding Dimensions: ${modelConfig.embeddings.dimensions}

CUSTOM SETTINGS:
${Object.keys(customSettings).length > 0 ? 
  Object.entries(customSettings).map(([key, value]) => `  ${key}: ${value}`).join('\n') : 
  '  None (using defaults)'}

Available models: ${Object.keys(config.models).join(', ')}
`);
}

// Default configuration for global installation
function getDefaultConfig() {
  return {
    defaultModel: "chatgpt",
    models: {
      chatgpt: {
        name: "openai",
        model: "gpt-4o",
        endpoint: "chatgpt/chat/completions",
        responseType: "lorem",
        maxLoremParas: 8,
        validateRequests: true,
        logRequests: true,
        debug: false,
        stream: false,
        responseDelay: { min: 3000, max: 5000 },
        embeddings: { enabled: true, dimensions: 128 }
      },
      gemini: {
        name: "gemini",
        model: "gemini-pro",
        endpoint: "models/gemini-pro:generateContent",
        responseType: "lorem",
        maxLoremParas: 8,
        validateRequests: true,
        logRequests: true,
        debug: false,
        stream: false,
        responseDelay: { min: 3000, max: 5000 },
        embeddings: { enabled: true, dimensions: 128 }
      },
      streaming: {
        name: "openai",
        model: "gpt-4o",
        endpoint: "chatgpt/chat/completions",
        responseType: "lorem",
        maxLoremParas: 8,
        validateRequests: true,
        logRequests: true,
        debug: false,
        stream: true,
        responseDelay: { min: 3000, max: 5000 },
        embeddings: { enabled: true, dimensions: 128 }
      },
      embeddings: {
        name: "openai",
        model: "text-embedding-3-small",
        endpoint: "chatgpt/chat/completions",
        responseType: "lorem",
        maxLoremParas: 8,
        validateRequests: true,
        logRequests: true,
        debug: false,
        stream: false,
        responseDelay: { min: 0, max: 0 },
        embeddings: { enabled: true, dimensions: 128 }
      }
    },
    server: {
      port: 8001,
      host: "0.0.0.0"
    }
  };
}

// Load configuration
async function loadConfig() {
  let config;
  let configPath = resolve(process.cwd(), '.llm-mock-rc.json');
  
  // Try to load local config file first
  if (existsSync(configPath)) {
    try {
      const fs = await import('fs');
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.error('Error parsing .llm-mock-rc.json:', error.message);
      process.exit(1);
    }
  } else {
    // Use default configuration for global installation
    config = getDefaultConfig();
    console.log('Using default configuration (no .llm-mock-rc.json found)');
  }
  
  // Validate model exists
  if (!config.models[modelName]) {
    console.error(`Error: Model "${modelName}" not found in configuration`);
    console.error(`Available models: ${Object.keys(config.models).join(', ')}`);
    process.exit(1);
  }

  return { config, modelName };
}

// Set environment variables based on configuration
function setEnvironmentVariables(config, modelName) {
  const modelConfig = config.models[modelName];
  const serverConfig = config.server;

  // Pass the selected model name to the server
  process.env.LLM_MODEL_NAME = modelName;

  // Server settings (with custom overrides)
  process.env.SERVER_PORT = customSettings.port || serverConfig.port.toString();
  process.env.LLM_URL_ENDPOINT = customSettings.endpoint || modelConfig.endpoint;
  
  // LLM settings (with custom overrides)
  process.env.LLM_NAME = modelConfig.name;
  process.env.LLM_MODEL = modelConfig.model;
  process.env.MOCK_LLM_RESPONSE_TYPE = customSettings.responseType || modelConfig.responseType;
  process.env.MAX_LOREM_PARAS = customSettings.maxLoremParas || modelConfig.maxLoremParas.toString();
  
  // Feature flags (with custom overrides)
  process.env.VALIDATE_REQUESTS = (customSettings.validateRequests !== undefined ? 
    customSettings.validateRequests === 'true' : modelConfig.validateRequests) ? 'ON' : 'OFF';
  process.env.LOG_REQUESTS = (customSettings.logRequests !== undefined ? 
    customSettings.logRequests === 'true' : modelConfig.logRequests) ? 'ON' : 'OFF';
  process.env.DEBUG = (customSettings.debug !== undefined ? 
    customSettings.debug === 'true' : modelConfig.debug) ? '*' : 'OFF';
  process.env.STREAM = (customSettings.stream !== undefined ? 
    customSettings.stream === 'true' : modelConfig.stream) ? 'true' : 'false';
  
  // Response delays (with custom overrides)
  process.env.RESPONSE_DELAY_MIN = customSettings.delayMin || modelConfig.responseDelay.min.toString();
  process.env.RESPONSE_DELAY_MAX = customSettings.delayMax || modelConfig.responseDelay.max.toString();
  
  // Embeddings (with custom overrides)
  process.env.ENABLE_EMBEDDINGS_MOCK = (customSettings.embeddings !== undefined ? 
    customSettings.embeddings === 'true' : modelConfig.embeddings.enabled) ? 'true' : 'false';
  process.env.EMBEDDING_DIMENSION = customSettings.embeddingDimensions || modelConfig.embeddings.dimensions.toString();
}

// Main execution
async function main() {
  try {
    // Handle help command
    if (showHelp) {
      showHelpInfo();
      return;
    }
    
    const { config, modelName: selectedModel } = await loadConfig();
    
    // Handle config command
    if (showConfig) {
      showCurrentConfig(config, selectedModel);
      return;
    }
    
    setEnvironmentVariables(config, selectedModel);
    
    console.log(`Starting LLM Mock Server with model: ${selectedModel}`);
    console.log(`Server will be available at: http://${customSettings.host || config.server.host}:${customSettings.port || config.server.port}`);
    
    // Import and start the server using tsx for TypeScript support
    const { exec } = await import('child_process');
    
    const serverPath = resolve(__dirname, '../src/server.ts');
    const packageDir = resolve(__dirname, '..');
    
    // Use tsx to run TypeScript server
    // Set cwd to package directory so TypeScript files can be found
    const serverProcess = exec(`npx tsx "${serverPath}"`, {
      stdio: 'inherit',
      cwd: packageDir
    });
    
    // Handle process exit
    serverProcess.on('exit', (code) => {
      console.log(`Server process exited with code: ${code}`);
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
