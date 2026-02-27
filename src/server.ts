import '@dotenvx/dotenvx';
import fastify from 'fastify';
import * as seeders from './seeders/index.js';
import getApiRoutes from './utilities/file-scan.js';
import serverPage from './utilities/server-page.js';
import logPage from './utilities/log-page.js';
import { dbLoadFromDisk } from './models/db.js';

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
	await app.listen({
		port: Number(process.env?.SERVER_PORT ?? 8000),
		host: '0.0.0.0',
	});
	console.log('\n*****************************************************');
	console.log(
		`SERVER UP AND RUNNING ON LOCALHOST:${process.env?.SERVER_PORT ?? 8000}`,
	);
	console.log('*****************************************************');
} catch (error) {
	app.log.error(error);
	process.exit(1);
}
