import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ApiFile = Promise<{
	default: (app: FastifyInstance, pathName: string) => void;
}>;

export default async function getApiRoutes(app: FastifyInstance) {
	const apiRootDirectoryPath = `${__dirname}/../api`;

	const apiFileImportPromises: ApiFile[] = [];
	const apiRoutes: string[] = [];

	const apiDirectories = fs.readdirSync(apiRootDirectoryPath);

	for (const directory of apiDirectories) {
		const filePath = path.join(apiRootDirectoryPath, directory);
		const stats = fs.statSync(filePath);

		if (stats.isDirectory()) {
			console.log(
				`Found folder in src/api: Adding New Route ${directory}`,
			);
			// Add directory/route name to list of api paths
			apiRoutes.push(directory);

			// Import the api.ts file (assuming it's in each directory) - this returns a promise
			const apiFilePath = path.join(filePath, 'api.ts');
			const fileUrl = pathToFileURL(apiFilePath).href;
			const importPromise = import(fileUrl) as ApiFile;
			// Add new import promises to array of promises to be used by promise.all below
			apiFileImportPromises.push(importPromise);
		}
	}

	/* Load all api modules and register their routes on the provided Fastify instance */
	return Promise.all(apiFileImportPromises)
		.then((files) => {
			for (const [index, file] of files.entries()) {
				const routePath = apiRoutes[index];
				file.default(app, routePath);
			}
		})
		.then(() => {
			// When all are resolved then return the api route names
			return { apiRoutes };
		})
		.catch((error: unknown) => {
			// If any of the promises fail then throw an error
			// This will be the case if the api.ts file is not found in the directory
			// or if the file is not in a valid format
			if (error instanceof Error) {
				// eslint-disable-next-line unicorn/prefer-type-error -- This is not a type error
				throw new Error(
					`
                ********************************************************************************************************************************
                CANNOT LOAD AN API ROUTE FROM SRC/API - CHECK AN API.TS FILE EXISTS IN EACH DIRECTORY THAT RETURNS A HANDLER ARRAY (SEE README):
                *********************************************************************************************************************************\n
                \nDetails:\n\n${error.message}`,
				);
			}

			throw new Error(
				'An unknown error occurred while loading the API routes',
			);
		});
}
