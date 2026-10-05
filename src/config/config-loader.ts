import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
	type ResponseRule,
	validateResponseRules,
} from '../utilities/response-rules.js';
import { validateStoredResponsesFile } from '../utilities/stored-responses.js';

export interface ResponseDelay {
	min: number;
	max: number;
}

export interface EmbeddingsConfig {
	enabled: boolean;
	dimensions: number;
}

export interface ChaosConfig {
	enabled: boolean;
	// X in "1 in X calls"; 1 fails every call
	frequency: number;
	mode: 'every' | 'random';
	status: number;
}

export interface ModelConfig {
	name: string;
	model: string;
	endpoint: string;
	responseType: 'lorem' | 'stored';
	maxLoremParas: number;
	validateRequests: boolean;
	logRequests: boolean;
	// Optional: how many requests the log keeps (default 10, at most 100)
	maxLoggedRequests?: number;
	debug: boolean;
	stream: boolean;
	responseDelay: ResponseDelay;
	embeddings: EmbeddingsConfig;
	// Optional: return a fixture file's contents when the request contains `match`
	responseRules?: ResponseRule[];
	// Optional: JSON file of texts that `responseType: "stored"` picks from
	storedResponsesFile?: string;
	// Optional: answer some calls with an HTTP error (off unless enabled)
	chaos?: Partial<ChaosConfig>;
}

export interface ServerConfig {
	port: number;
	host: string;
}

export interface LlmMockConfig {
	defaultModel: string;
	models: Record<string, ModelConfig>;
	server: ServerConfig;
}

let configCache: LlmMockConfig | null = null;
// Folder holding the loaded config file; response rule files and project-level
// templates resolve against it.
let configDir = process.cwd();
let currentModelCache: string | null = null;

// Default configuration for global installation
function getDefaultConfig(): LlmMockConfig {
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

export function loadConfig(configPath?: string): LlmMockConfig {
	if (configCache) {
		return configCache;
	}

	const path = configPath || resolve(process.cwd(), '.llmockrc.json');

	configDir = dirname(path);

	if (!existsSync(path)) {
		// For global usage, provide default configuration when no config file exists
		return getDefaultConfig();
	}

	try {
		const configData = readFileSync(path, 'utf8');
		configCache = JSON.parse(configData) as LlmMockConfig;
		return configCache;
	} catch (error) {
		throw new Error(
			`Failed to parse configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

export function getModelConfig(modelName?: string): ModelConfig {
	const config = loadConfig();
	const selectedModel = modelName || config.defaultModel || 'chatgpt';

	if (!config.models[selectedModel]) {
		const availableModels = Object.keys(config.models);
		throw new Error(
			`Model "${selectedModel}" not found. Available models: ${availableModels.join(', ')}`,
		);
	}

	currentModelCache = selectedModel;
	return config.models[selectedModel];
}

/**
 * Response rules of the active model preset, plus the folder their files
 * resolve against. Reads the config directly so it does not change the
 * current-model cache.
 */
export function getResponseRules(): {
	rules: ResponseRule[];
	baseDir: string;
} {
	const config = loadConfig();
	const name =
		process.env.LLM_MODEL_NAME || currentModelCache || config.defaultModel;

	return {
		rules: validateResponseRules(config.models[name]?.responseRules),
		baseDir: configDir,
	};
}

/**
 * Stored responses file of the active model preset (undefined when the
 * bundled texts are used), plus the folder it resolves against.
 */
export function getStoredResponsesFile(): {
	file: string | undefined;
	baseDir: string;
} {
	const config = loadConfig();
	const name =
		process.env.LLM_MODEL_NAME || currentModelCache || config.defaultModel;

	return {
		file: validateStoredResponsesFile(
			config.models[name]?.storedResponsesFile,
		),
		baseDir: configDir,
	};
}

export function getConfigDir(): string {
	return configDir;
}

export function getCurrentModel(): string | null {
	return currentModelCache;
}

// Chaos settings - only set if not already set by CLI
function setChaosEnvironment(chaos: Partial<ChaosConfig> = {}): void {
	const {
		enabled = false,
		frequency = 1,
		mode = 'every',
		status = 500,
	} = chaos;

	process.env.CHAOS_ENABLED ||= enabled ? 'true' : 'false';
	process.env.CHAOS_FREQUENCY ||= frequency.toString();
	process.env.CHAOS_MODE ||= mode;
	process.env.CHAOS_STATUS ||= status.toString();
}

export function setEnvironmentFromConfig(modelName?: string): void {
	const modelConfig = getModelConfig(modelName);
	const config = loadConfig();

	// Server settings - only set if not already set by CLI
	process.env.SERVER_PORT =
		process.env.SERVER_PORT || config.server.port.toString();
	process.env.LLM_URL_ENDPOINT =
		process.env.LLM_URL_ENDPOINT || modelConfig.endpoint;

	// LLM settings
	process.env.LLM_NAME = process.env.LLM_NAME || modelConfig.name;
	process.env.LLM_MODEL = process.env.LLM_MODEL || modelConfig.model;
	process.env.MOCK_LLM_RESPONSE_TYPE =
		process.env.MOCK_LLM_RESPONSE_TYPE || modelConfig.responseType;
	process.env.MAX_LOREM_PARAS =
		process.env.MAX_LOREM_PARAS || modelConfig.maxLoremParas.toString();

	// Feature flags - only set if not already set by CLI
	process.env.VALIDATE_REQUESTS =
		process.env.VALIDATE_REQUESTS ||
		(modelConfig.validateRequests ? 'ON' : 'OFF');
	process.env.LOG_REQUESTS =
		process.env.LOG_REQUESTS || (modelConfig.logRequests ? 'ON' : 'OFF');
	process.env.MAX_LOGGED_REQUESTS =
		process.env.MAX_LOGGED_REQUESTS ||
		(modelConfig.maxLoggedRequests ?? 10).toString();
	process.env.DEBUG = process.env.DEBUG || (modelConfig.debug ? '*' : 'OFF');
	process.env.STREAM =
		process.env.STREAM || (modelConfig.stream ? 'true' : 'false');

	// Response delays - only set if not already set by CLI
	process.env.RESPONSE_DELAY_MIN =
		process.env.RESPONSE_DELAY_MIN ||
		modelConfig.responseDelay.min.toString();
	process.env.RESPONSE_DELAY_MAX =
		process.env.RESPONSE_DELAY_MAX ||
		modelConfig.responseDelay.max.toString();

	setChaosEnvironment(modelConfig.chaos);

	// Embeddings - only set if not already set by CLI
	process.env.ENABLE_EMBEDDINGS_MOCK =
		process.env.ENABLE_EMBEDDINGS_MOCK ||
		(modelConfig.embeddings.enabled ? 'true' : 'false');
	process.env.EMBEDDING_DIMENSION =
		process.env.EMBEDDING_DIMENSION ||
		modelConfig.embeddings.dimensions.toString();
}

export function getAvailableModels(): string[] {
	const config = loadConfig();
	return Object.keys(config.models);
}

export function validateConfig(config: any): LlmMockConfig {
	// Basic validation - can be expanded
	if (!config.models || typeof config.models !== 'object') {
		throw new Error('Configuration must contain a "models" object');
	}

	if (!config.server || typeof config.server !== 'object') {
		throw new Error('Configuration must contain a "server" object');
	}

	if (!config.server.port || typeof config.server.port !== 'number') {
		throw new Error(
			'Server configuration must contain a valid "port" number',
		);
	}

	return config as LlmMockConfig;
}
