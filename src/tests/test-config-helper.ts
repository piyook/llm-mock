import { readFileSync, existsSync, copyFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import {
	setEnvironmentFromConfig,
	loadConfig,
} from '../config/config-loader.js';

const TEST_CONFIG_PATH = resolve(process.cwd(), '.llm-mock-rc.test.json');
const ORIGINAL_CONFIG_PATH = resolve(process.cwd(), '.llm-mock-rc.json');
const BACKUP_CONFIG_PATH = resolve(process.cwd(), '.llm-mock-rc.backup.json');

export function setupTestConfig(modelName: string = 'chatgpt') {
	// Backup original config if it exists
	if (existsSync(ORIGINAL_CONFIG_PATH)) {
		copyFileSync(ORIGINAL_CONFIG_PATH, BACKUP_CONFIG_PATH);
	}

	// Copy test config to main config location
	if (existsSync(TEST_CONFIG_PATH)) {
		copyFileSync(TEST_CONFIG_PATH, ORIGINAL_CONFIG_PATH);
	}

	// Load and apply test configuration
	const config = loadConfig();
	setEnvironmentFromConfig(modelName);
}

export function restoreOriginalConfig() {
	// Restore original config if backup exists
	if (existsSync(BACKUP_CONFIG_PATH)) {
		copyFileSync(BACKUP_CONFIG_PATH, ORIGINAL_CONFIG_PATH);
		unlinkSync(BACKUP_CONFIG_PATH);
	}
}

export function setTestEnvironmentVariables() {
	process.env.VALIDATE_REQUESTS = 'ON';
	process.env.LOG_REQUESTS = 'OFF';
	process.env.RESPONSE_DELAY_MIN = '0';
	process.env.RESPONSE_DELAY_MAX = '0';
	process.env.LLM_NAME = 'openai';
	process.env.LLM_MODEL = 'gpt-4o';
	process.env.MOCK_LLM_RESPONSE_TYPE = 'lorem';
	process.env.MAX_LOREM_PARAS = '8';
	process.env.STREAM = 'false';
	process.env.ENABLE_EMBEDDINGS_MOCK = 'true';
	process.env.EMBEDDING_DIMENSION = '128';
	process.env.SERVER_PORT = '8001';
	process.env.LLM_URL_ENDPOINT = 'chatgpt/chat/completions';
}
