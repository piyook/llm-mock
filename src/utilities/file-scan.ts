import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type HttpHandler } from 'msw';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ApiFile = Promise<{
    default: (pathName: string) => HttpHandler[];
}>;

export default async function getApiPaths() {
    const apiFolder = `${__dirname}/../api`;

    const apiHandlersPromises: ApiFile[] = [];
    const apiHandlers: HttpHandler[] = [];
    const apiPaths: string[] = [];

    const files = fs.readdirSync(apiFolder);

    const prefix = process.env?.LLM_URL_ENDPOINT ?? '';

    for (const file of files) {
        const filePath = path.join(apiFolder, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            // Get the directory name
            console.log(`Api Path: ${prefix}${file}`);
            apiPaths.push(file);

            // Import index.ts file (assuming it's in each directory) - this returns a promise
            try {
                const importPromise = import(
                    `file://${path.join(filePath, 'api.ts')}`
                ) as ApiFile;
                // Add new import promises to array of promises to be used by promise.all
                apiHandlersPromises.push(importPromise);
            } catch (error) {
                console.error('Error importing index.ts file:', error);
            }
        }
    }

    // Return a promise.all to resolve all promises that will themselves return the api handlers function that can be called with the api paths
    return Promise.all(apiHandlersPromises)
        .then((handlers) => {
            for (const [index, handler] of handlers.entries()) {
                // Add new handlers with the desired apiPath to return array - remember to spread these out as may be more than one
                apiHandlers.push(...handler.default(`${prefix}`));
            }
        })
        .then(() => {
            // When all are resolved then return the handlers and paths
            return { apiHandlers, apiPaths };
        });
}
