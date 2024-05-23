import 'dotenv/config';
import { createServer } from '@mswjs/http-middleware';
import * as seeders from './seeders/index.js';
import getApiPaths from './utilities/file-scan.js';
import serverPage from './utilities/server-page.js';

const { apiHandlers, apiPaths } = await getApiPaths();

const httpServer = createServer(...apiHandlers, ...serverPage(apiPaths));

httpServer.listen(process.env?.SERVER_PORT ?? 8000);

// Execute dB seeder functions
for (const seeder of Object.values(seeders)) {
    seeder();
}

console.log(`SERVER UP AND RUNNING ON LOCALHOST:${process.env.SERVER_PORT}`);
