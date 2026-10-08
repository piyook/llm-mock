import fastify from 'fastify';
import * as seeders from './seeders/index.js';
import getApiRoutes from './utilities/file-scan.js';
import serverPage from './utilities/server-page.js';
import adminApi, { adminApiEnabled } from './utilities/admin-api.js';
import { dbLoadFromDisk } from './models/db.js';
import {
	setEnvironmentFromConfig,
	getCurrentModel,
	getResponseRules,
	getStoredResponsesFile,
	loadConfig,
} from './config/config-loader.js';
import { readRuleFile, ruleFiles } from './utilities/response-rules.js';
import { loadStoredResponses } from './utilities/stored-responses.js';
import { releaseStalledOnClose } from './utilities/chaos.js';

// Initialize configuration from .llmockrc.json
// Use config path from CLI if available, otherwise look in current working directory
const configPath = process.env.CONFIG_PATH;
const config = loadConfig(configPath);
const modelName = process.env.LLM_MODEL_NAME || config.defaultModel;
setEnvironmentFromConfig(modelName);

// Fail fast on malformed responseRules and warn about fixture files that can't be read
const { rules: responseRules, baseDir: rulesDir } = getResponseRules();
for (const rule of responseRules) {
	for (const file of ruleFiles(rule)) {
		try {
			readRuleFile(rule, file, rulesDir);
		} catch (error) {
			console.warn(`WARNING: ${(error as Error).message}`);
		}
	}
}

// Fail fast on a malformed storedResponsesFile path, and on a file that can't
// be used when stored responses are what this server will serve
const { file: storedFile, baseDir: storedDir } = getStoredResponsesFile();
if (storedFile && process.env.MOCK_LLM_RESPONSE_TYPE === 'stored') {
	loadStoredResponses(storedFile, storedDir);
}

const app = fastify({ logger: false });

// A connection held open by chaos must not keep the server from stopping
releaseStalledOnClose(app);

const { apiRoutes } = await getApiRoutes(app);

serverPage(app, apiRoutes);

if (adminApiEnabled()) adminApi(app);

// Load database from disk if persistence is enabled
const loaded = dbLoadFromDisk();

// Execute dB seeder functions only if database wasn't loaded from disk
const seedRequested =
	process.env?.MOCK_DB_SEED_ON_START?.toUpperCase() === 'ON';
const shouldSeed = seedRequested || !loaded;

if (shouldSeed) {
	for (const seeder of Object.values(seeders)) {
		seeder();
	}
}

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
	console.log(`\nReceived ${signal}, closing server gracefully...`);
	await app.close();
	process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

try {
	const currentModel = getCurrentModel();
	await app.listen({
		port: Number(process.env?.SERVER_PORT ?? 8001),
		host: process.env?.SERVER_HOST || '0.0.0.0',
	});
	console.log('\n*****************************************************');
	console.log(
		`SERVER UP AND RUNNING ON LOCALHOST:${process.env?.SERVER_PORT ?? 8001}`,
	);
	console.log(`USING MODEL: ${currentModel?.toUpperCase() || 'CHATGPT'}`);
	console.log('*****************************************************');
} catch (error) {
	console.error('Server startup error:', error);
	if (error instanceof Error) {
		console.error('Error details:', error.message);
		console.error('Error stack:', error.stack);
	}
	app.log.error(error);
	process.exit(1);
}
