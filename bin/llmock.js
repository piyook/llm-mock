#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	applyConfigDefaults,
	parseCliArgs,
	parseListeningPids,
	resolveModelName,
	tsxCliPath,
} from './process-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const {
	command,
	showHelp,
	showConfig,
	modelName,
	customSettings,
	stopPort,
	foregroundMode,
} = parseCliArgs(process.argv.slice(2));

// Show help information
function showHelpInfo() {
	console.log(`
LLM Mock Server - A configurable mock LLM API server

USAGE:
  llmock <command> [options]

COMMANDS:
  start                   Start the mock server (default)
  stop                    Stop running mock server
  help                    Show this help message
  config                  Show current configuration settings

OPTIONS:
  --model=<name>          Model preset to use (chatgpt, gemini, streaming, embeddings, claude)
  --port=<number>         Server port (default: 8001)
  --host=<address>        Server host (default: 0.0.0.0)
  --endpoint=<path>       LLM endpoint path
  --responseType=<type>   Response type (lorem, stored)
  --maxLoremParas=<num>    Maximum lorem ipsum sentences
  --validateRequests=<bool> Validate incoming requests (true/false)
  --logRequests=<bool>    Log incoming requests (true/false)
  --maxLoggedRequests=<num> Requests kept in the log (default: 10, max: 100)
  --debug=<bool>          Enable debug mode (true/false)
  --stream=<bool>          Enable streaming responses (true/false)
  --delayMin=<ms>          Minimum response delay in milliseconds
  --delayMax=<ms>          Maximum response delay in milliseconds
  --chaos=<bool>           Answer some calls with an HTTP error (true/false)
  --chaosFrequency=<num>   Fail 1 in <num> calls (default: 1, every call)
  --chaosMode=<mode>       every (each <num>th call) or random (1 in <num> chance)
  --chaosStatus=<code>     HTTP status of the error (default: 500)
  --embeddings=<bool>      Enable embeddings mock (true/false)
  --embeddingDimensions=<num> Embedding vector dimensions
  --foreground            Run server in foreground (for Docker use)

EXAMPLES:
  llmock start                              # Start with default chatgpt model
  llmock start --model=gemini              # Use gemini model preset
  llmock start --port=3000 --host=localhost # Custom server settings
  llmock start --debug=true --stream=true   # Enable debug and streaming
  llmock start --delayMin=1000 --delayMax=2000 # Custom response delays
  llmock start --chaos=true --chaosFrequency=3 --chaosStatus=429 # Every 3rd call fails with a 429
  llmock stop                               # Stop running server on default port
  llmock stop --port=3000                   # Stop server on port 3000
  llmock config                              # Show current configuration

For more information, visit: https://github.com/piyook/llmock
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
  Max Logged Requests: ${modelConfig.maxLoggedRequests}
  Debug: ${modelConfig.debug}
  Stream: ${modelConfig.stream}
  Response Delay: ${modelConfig.responseDelay.min}ms - ${modelConfig.responseDelay.max}ms
  Chaos Enabled: ${modelConfig.chaos.enabled}
  Chaos Frequency: 1 in ${modelConfig.chaos.frequency} calls (${modelConfig.chaos.mode})
  Chaos Error Status: ${modelConfig.chaos.status}
  Embeddings Enabled: ${modelConfig.embeddings.enabled}
  Embedding Dimensions: ${modelConfig.embeddings.dimensions}

CUSTOM SETTINGS:
${
	Object.keys(customSettings).length > 0
		? Object.entries(customSettings)
				.map(([key, value]) => `  ${key}: ${value}`)
				.join('\n')
		: '  None (using defaults)'
}

Available models: ${Object.keys(config.models).join(', ')}
`);
}

// Stop running llm-mock server
async function stopServer(port = 8001) {
	const { exec } = await import('node:child_process');

	const isWindows = process.platform === 'win32';

	return new Promise((resolve) => {
		// Only the listening process, not clients connected to the port
		const findCommand = isWindows
			? 'netstat -ano'
			: `lsof -ti tcp:${port} -sTCP:LISTEN`;

		exec(findCommand, (error, stdout) => {
			if (error || !stdout.trim()) {
				console.log(`No running llmock server found on port ${port}.`);
				resolve();
				return;
			}

			let pids = [];

			if (isWindows) {
				pids = parseListeningPids(stdout, port);
			} else {
				pids = stdout.trim().split('\n').filter(Boolean);
			}

			if (pids.length === 0) {
				console.log(`No process found on port ${port}.`);
				resolve();
				return;
			}

			const killCommand = isWindows
				? pids.map((pid) => `taskkill /PID ${pid} /T /F`).join(' && ')
				: `kill -9 ${pids.join(' ')}`;

			exec(killCommand, () => {
				console.log(
					`llmock server stopped successfully on port ${port}.`,
				);
				resolve();
			});
		});
	});
}

// Default configuration for global installation
function getDefaultConfig() {
	return {
		defaultModel: 'chatgpt',
		models: {
			chatgpt: {
				name: 'openai',
				model: 'gpt-4o',
				endpoint: 'chatgpt/chat/completions',
				responseType: 'lorem',
				maxLoremParas: 8,
				validateRequests: true,
				logRequests: true,
				debug: false,
				stream: false,
				responseDelay: { min: 3000, max: 5000 },
				embeddings: { enabled: true, dimensions: 128 },
			},
			gemini: {
				name: 'gemini',
				model: 'gemini-pro',
				endpoint: 'models/gemini-pro:generateContent',
				responseType: 'lorem',
				maxLoremParas: 8,
				validateRequests: true,
				logRequests: true,
				debug: false,
				stream: false,
				responseDelay: { min: 3000, max: 5000 },
				embeddings: { enabled: true, dimensions: 128 },
			},
			streaming: {
				name: 'openai',
				model: 'gpt-4o',
				endpoint: 'chatgpt/chat/completions',
				responseType: 'lorem',
				maxLoremParas: 8,
				validateRequests: true,
				logRequests: true,
				debug: false,
				stream: true,
				responseDelay: { min: 3000, max: 5000 },
				embeddings: { enabled: true, dimensions: 128 },
			},
			embeddings: {
				name: 'openai',
				model: 'text-embedding-3-small',
				endpoint: 'chatgpt/chat/completions',
				responseType: 'lorem',
				maxLoremParas: 8,
				validateRequests: true,
				logRequests: true,
				debug: false,
				stream: false,
				responseDelay: { min: 0, max: 0 },
				embeddings: { enabled: true, dimensions: 128 },
			},
			claude: {
				name: 'claude',
				model: 'claude-opus-5-5',
				endpoint: 'v1/messages',
				responseType: 'lorem',
				maxLoremParas: 8,
				validateRequests: true,
				logRequests: true,
				debug: false,
				stream: false,
				responseDelay: { min: 200, max: 800 },
				embeddings: { enabled: false, dimensions: 128 },
			},
		},
		server: {
			port: 8001,
			host: '0.0.0.0',
		},
	};
}

// Config file to use: CONFIG_PATH (e.g. the e2e test config) or ./.llmockrc.json
function resolveConfigPath() {
	return resolve(process.cwd(), process.env.CONFIG_PATH || '.llmockrc.json');
}

// Load configuration
async function loadConfig() {
	let config;
	const configPath = resolveConfigPath();

	// Try to load local config file first
	if (existsSync(configPath)) {
		try {
			const fs = await import('node:fs');
			config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		} catch (error) {
			console.error('Error parsing .llmockrc.json:', error.message);
			process.exit(1);
		}
	} else {
		// Use default configuration for global installation
		config = getDefaultConfig();
		console.log('Using default configuration (no .llmockrc.json found)');
	}

	// --model wins, then the config's defaultModel, then chatgpt
	const selectedModel = resolveModelName(modelName, config);

	// Validate model exists
	if (!config.models[selectedModel]) {
		console.error(
			`Error: Model "${selectedModel}" not found in configuration`,
		);
		console.error(
			`Available models: ${Object.keys(config.models).join(', ')}`,
		);
		process.exit(1);
	}

	// Fill in optional settings so a short preset works
	try {
		config = applyConfigDefaults(config, selectedModel);
	} catch (error) {
		console.error(`Error: ${error.message}`);
		process.exit(1);
	}

	return { config, modelName: selectedModel };
}

// Set environment variables based on configuration
function setEnvironmentVariables(config, modelName, configPath) {
	const modelConfig = config.models[modelName];
	const serverConfig = config.server;

	// Pass the selected model name and config path to the server
	process.env.LLM_MODEL_NAME = modelName;
	process.env.CONFIG_PATH = configPath;

	// Server settings (with custom overrides)
	process.env.SERVER_PORT =
		customSettings.port || serverConfig.port.toString();
	process.env.SERVER_HOST = customSettings.host || serverConfig.host;
	process.env.LLM_URL_ENDPOINT =
		customSettings.endpoint || modelConfig.endpoint;

	// LLM settings (with custom overrides)
	process.env.LLM_NAME = modelConfig.name;
	process.env.LLM_MODEL = modelConfig.model;
	process.env.MOCK_LLM_RESPONSE_TYPE =
		customSettings.responseType || modelConfig.responseType;
	process.env.MAX_LOREM_PARAS =
		customSettings.maxLoremParas || modelConfig.maxLoremParas.toString();

	// Feature flags (with custom overrides)
	process.env.VALIDATE_REQUESTS = (
		customSettings.validateRequests !== undefined
			? customSettings.validateRequests === 'true'
			: modelConfig.validateRequests
	)
		? 'ON'
		: 'OFF';
	process.env.LOG_REQUESTS = (
		customSettings.logRequests !== undefined
			? customSettings.logRequests === 'true'
			: modelConfig.logRequests
	)
		? 'ON'
		: 'OFF';
	process.env.MAX_LOGGED_REQUESTS =
		customSettings.maxLoggedRequests ||
		modelConfig.maxLoggedRequests.toString();
	process.env.DEBUG = (
		customSettings.debug !== undefined
			? customSettings.debug === 'true'
			: modelConfig.debug
	)
		? '*'
		: 'OFF';
	process.env.STREAM = (
		customSettings.stream !== undefined
			? customSettings.stream === 'true'
			: modelConfig.stream
	)
		? 'true'
		: 'false';

	// Response delays (with custom overrides)
	process.env.RESPONSE_DELAY_MIN =
		customSettings.delayMin || modelConfig.responseDelay.min.toString();
	process.env.RESPONSE_DELAY_MAX =
		customSettings.delayMax || modelConfig.responseDelay.max.toString();

	// Chaos (with custom overrides)
	process.env.CHAOS_ENABLED = (
		customSettings.chaos !== undefined
			? customSettings.chaos === 'true'
			: modelConfig.chaos.enabled
	)
		? 'true'
		: 'false';
	process.env.CHAOS_FREQUENCY =
		customSettings.chaosFrequency || modelConfig.chaos.frequency.toString();
	process.env.CHAOS_MODE = customSettings.chaosMode || modelConfig.chaos.mode;
	process.env.CHAOS_STATUS =
		customSettings.chaosStatus || modelConfig.chaos.status.toString();

	// Embeddings (with custom overrides)
	process.env.ENABLE_EMBEDDINGS_MOCK = (
		customSettings.embeddings !== undefined
			? customSettings.embeddings === 'true'
			: modelConfig.embeddings.enabled
	)
		? 'true'
		: 'false';
	process.env.EMBEDDING_DIMENSION =
		customSettings.embeddingDimensions ||
		modelConfig.embeddings.dimensions.toString();

	// The embeddings mock owns /v1/embeddings, so the chat endpoint can't use it too
	const endpoint = process.env.LLM_URL_ENDPOINT.replace(/^\/+/, '');
	if (
		endpoint === 'v1/embeddings' &&
		process.env.ENABLE_EMBEDDINGS_MOCK === 'true'
	) {
		throw new Error(
			`Model "${modelName}" uses the endpoint "v1/embeddings", which the embeddings mock already serves. Use a different endpoint or set embeddings.enabled to false.`,
		);
	}
}

// URL the CLI uses to reach the server it started
function pingUrl(config) {
	const host = customSettings.host || config.server.host;
	const port = customSettings.port || config.server.port;
	const reachable = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
	return `http://${reachable.includes(':') ? `[${reachable}]` : reachable}:${port}/ping`;
}

async function isServerUp(url) {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(1000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

// Main execution
async function main() {
	try {
		// Handle help command
		if (showHelp) {
			showHelpInfo();
			return;
		}

		// Handle stop command
		if (command === 'stop') {
			await stopServer(stopPort);
			return;
		}

		// Handle config command
		if (showConfig) {
			const { config, modelName: selectedModel } = await loadConfig();
			showCurrentConfig(config, selectedModel);
			return;
		}

		// Handle start command (default)
		if (command === 'start') {
			const { config, modelName: selectedModel } = await loadConfig();
			const configPath = resolveConfigPath();
			setEnvironmentVariables(config, selectedModel, configPath);

			// A detached server that can't bind the port would fail unseen
			if (
				!foregroundMode &&
				process.env.E2E_MODE !== 'true' &&
				(await isServerUp(pingUrl(config)))
			) {
				console.error(
					`A server is already running on port ${process.env.SERVER_PORT}. Run 'llmock stop --port=${process.env.SERVER_PORT}' first, or start on another port with --port.`,
				);
				process.exit(1);
			}

			console.log(
				`Starting LLM Mock Server with model: ${selectedModel}`,
			);
			console.log(
				`Server will be available at: http://${customSettings.host || config.server.host}:${customSettings.port || config.server.port}`,
			);

			// Import and start the server using spawn for better process control
			const { spawn } = await import('node:child_process');

			const serverPath = resolve(__dirname, '../src/server.ts');
			const packageDir = resolve(__dirname, '..');

			// Run tsx's CLI with the current node binary rather than through npx, a
			// shell or `start`. This behaves the same on every platform, never opens
			// a console window on Windows, and the spawned pid is the real process.
			const isE2E = process.env.E2E_MODE === 'true';
			const serverArgs = [tsxCliPath(), serverPath];
			let serverProcess;

			if (foregroundMode) {
				// Run in foreground mode for Docker - keep process attached
				serverProcess = spawn(process.execPath, serverArgs, {
					cwd: packageDir,
					stdio: 'inherit',
					detached: false,
				});

				console.log(`Starting LLM Mock Server in foreground mode...`);
				console.log(
					`Server will be available at: http://${customSettings.host || config.server.host}:${customSettings.port || config.server.port}`,
				);

				serverProcess.on('error', (error) => {
					console.error(
						'Failed to start server process:',
						error.message,
					);
					process.exit(1);
				});

				// Keep the CLI alive and forward server output
				serverProcess.on('close', (code) => {
					console.log(`Server process exited with code ${code}`);
					process.exit(code);
				});
			} else {
				// Normal use detaches so the CLI can exit. E2E mode stays attached so
				// the test runner owns the process tree. windowsHide stops Windows
				// opening a console window for the detached server.
				serverProcess = spawn(process.execPath, serverArgs, {
					cwd: packageDir,
					stdio: isE2E ? 'inherit' : 'ignore',
					detached: !isE2E,
					windowsHide: true,
				});

				if (!isE2E) {
					serverProcess.unref();
				}

				serverProcess.on('error', (error) => {
					console.error(
						'Failed to start server process:',
						error.message,
					);
					process.exit(1);
				});

				if (isE2E) {
					// In E2E mode, stay alive and forward signals to maintain process tree
					serverProcess.on('close', (code) => {
						process.exit(code ?? 0);
					});

					process.on('SIGTERM', () => serverProcess.kill('SIGTERM'));
					process.on('SIGINT', () => serverProcess.kill('SIGINT'));
				} else {
					// Normal detached mode - wait until the server answers, then exit CLI.
					// Its output is not attached, so a failure can only be reported generally.
					let exitCode = null;
					serverProcess.on('exit', (code) => {
						exitCode = code ?? 1;
					});

					const url = pingUrl(config);
					const deadline = Date.now() + 20000;
					let started = false;
					while (
						!started &&
						exitCode === null &&
						Date.now() < deadline
					) {
						await new Promise((done) => setTimeout(done, 250));
						started = await isServerUp(url);
					}

					if (!started) {
						console.error(
							exitCode === null
								? 'Server did not respond within 20 seconds.'
								: `Server failed to start (exit code ${exitCode}).`,
						);
						console.error(
							`Run 'llmock start --foreground' with the same options to see the error.`,
						);
						process.exit(1);
					}

					console.log(`Server started successfully!`);
					console.log(
						`Server is running at: http://${customSettings.host || config.server.host}:${customSettings.port || config.server.port}`,
					);
					console.log(`Use 'llmock stop' to stop the server.`);
					process.exit(0);
				}
			}
		}
	} catch (error) {
		console.error('Failed to start server:', error.message);
		process.exit(1);
	}
}

main();
