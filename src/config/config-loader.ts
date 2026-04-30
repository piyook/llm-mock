import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface ResponseDelay {
	min: number;
	max: number;
}

export interface EmbeddingsConfig {
	enabled: boolean;
	dimensions: number;
}

export interface ModelConfig {
	name: string;
	model: string;
	endpoint: string;
	responseType: 'lorem' | 'stored';
	maxLoremParas: number;
	validateRequests: boolean;
	logRequests: boolean;
	debug: boolean;
	stream: boolean;
	responseDelay: ResponseDelay;
	embeddings: EmbeddingsConfig;
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
let currentModelCache: string | null = null;

export function loadConfig(configPath?: string): LlmMockConfig {
	if (configCache) {
		return configCache;
	}

	const path = configPath || resolve(process.cwd(), '.llm-mock-rc.json');

	if (!existsSync(path)) {
		throw new Error(`Configuration file not found: ${path}`);
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

export function getCurrentModel(): string | null {
	return currentModelCache;
}

export function setEnvironmentFromConfig(modelName?: string): void {
	const modelConfig = getModelConfig(modelName);
	const config = loadConfig();

	// Server settings - only set if not already set by CLI
	process.env.SERVER_PORT = process.env.SERVER_PORT || config.server.port.toString();
	process.env.LLM_URL_ENDPOINT = process.env.LLM_URL_ENDPOINT || modelConfig.endpoint;

	// LLM settings
	process.env.LLM_NAME = process.env.LLM_NAME || modelConfig.name;
	process.env.LLM_MODEL = process.env.LLM_MODEL || modelConfig.model;
	process.env.MOCK_LLM_RESPONSE_TYPE = process.env.MOCK_LLM_RESPONSE_TYPE || modelConfig.responseType;
	process.env.MAX_LOREM_PARAS = process.env.MAX_LOREM_PARAS || modelConfig.maxLoremParas.toString();

	// Feature flags - only set if not already set by CLI
	process.env.VALIDATE_REQUESTS = process.env.VALIDATE_REQUESTS || (modelConfig.validateRequests ? 'ON' : 'OFF');
	process.env.LOG_REQUESTS = process.env.LOG_REQUESTS || (modelConfig.logRequests ? 'ON' : 'OFF');
	process.env.DEBUG = process.env.DEBUG || (modelConfig.debug ? '*' : 'OFF');
	process.env.STREAM = process.env.STREAM || (modelConfig.stream ? 'true' : 'false');

	// Response delays - only set if not already set by CLI
	process.env.RESPONSE_DELAY_MIN = process.env.RESPONSE_DELAY_MIN || modelConfig.responseDelay.min.toString();
	process.env.RESPONSE_DELAY_MAX = process.env.RESPONSE_DELAY_MAX || modelConfig.responseDelay.max.toString();

	// Embeddings - only set if not already set by CLI
	process.env.ENABLE_EMBEDDINGS_MOCK = process.env.ENABLE_EMBEDDINGS_MOCK || (modelConfig.embeddings.enabled
		? 'true'
		: 'false');
	process.env.EMBEDDING_DIMENSION = process.env.EMBEDDING_DIMENSION ||
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
