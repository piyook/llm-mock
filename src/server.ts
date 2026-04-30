import fastify from 'fastify';
import * as seeders from './seeders/index.js';
import getApiRoutes from './utilities/file-scan.js';
import serverPage from './utilities/server-page.js';
import logPage from './utilities/log-page.js';
import { dbLoadFromDisk } from './models/db.js';
import {
	setEnvironmentFromConfig,
	getCurrentModel,
	loadConfig,
} from './config/config-loader.js';

// Initialize configuration from .llm-mock-rc.json
const config = loadConfig();
const modelName = process.env.LLM_MODEL_NAME || config.defaultModel;
setEnvironmentFromConfig(modelName);

const app = fastify({ logger: false });

const { apiRoutes } = await getApiRoutes(app);

serverPage(app, apiRoutes);
logPage(app);

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
		port: Number(process.env?.SERVER_PORT ?? 8000),
		host: '0.0.0.0',
	});
	console.log('\n*****************************************************');
	console.log(
		`SERVER UP AND RUNNING ON LOCALHOST:${process.env?.SERVER_PORT ?? 8000}`,
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
