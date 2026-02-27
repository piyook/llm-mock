/* eslint-disable @typescript-eslint/naming-convention */
import type { FastifyInstance } from 'fastify';
import { faker } from '@faker-js/faker';
import { db } from '../../models/db.js';
import { buildResponse } from '../../utilities/build-response.js';
import { validateRequest } from '../../utilities/validate-request.js';
import { delay, getDelayConfig } from '../../utilities/delay.js';

// Add any http handler here (get, push , delete etc., and middleware as needed)

const mockGPTResponse = async () => {
	let content = '';

	switch (process.env?.MOCK_LLM_RESPONSE_TYPE) {
		case 'lorem': {
			content = faker.lorem.sentences({
				min: 1,
				max: Number.parseInt(process.env?.MAX_LOREM_PARAS ?? '5', 10),
			});
			break;
		}

		case 'stored': {
			const storedResponses = db.llm.getAll();

			const random = faker.number.int({
				min: 0,
				max: storedResponses.length - 1,
			});
			content = storedResponses[random].content;

			break;
		}

		default: {
			content = faker.lorem.paragraphs({ min: 1, max: 10 });
		}
	}

	return buildResponse(content);
};

function handler(app: FastifyInstance, pathName: string) {
	const prefix = process.env?.LLM_URL_ENDPOINT ?? '';
	const fullPath = prefix || pathName;

	// GET route
	app.get(`/${fullPath}`, async (request, reply) => {
		// Apply delay if configured
		const delayConfig = getDelayConfig();
		if (delayConfig.enabled) {
			await delay(delayConfig.min, delayConfig.max);
		}

		return reply.send(await mockGPTResponse());
	});

	// POST route
	app.post(`/${fullPath}`, async (request, reply) => {
		if (await validateRequest(request)) {
			// Apply delay if configured
			const delayConfig = getDelayConfig();
			if (delayConfig.enabled) {
				await delay(delayConfig.min, delayConfig.max);
			}

			return reply.send(await mockGPTResponse());
		}

		console.log(
			`\nREQUEST ERROR: Invalid or missing request format for this LLM Model:${process.env?.LLM_NAME?.toUpperCase()}`,
		);

		return reply
			.status(400)
			.type('text/plain')
			.send(
				`Invalid or Missing Request For this LLM Model: ${process.env?.LLM_NAME?.toUpperCase()}`,
			);
	});
}

export default handler;
