import logger from './logger.js';

type LogData = {
	data: any;
	state: string;
	reason: string;
	information: string;
};

const logRequestBody = ({ data, state, reason, information }: LogData) => {
	console.log(
		`New API Request:${new Date().toLocaleString()}. Request data viewable in browser 'localhost:${process.env?.SERVER_PORT ?? '8000'}/logs' or in 'logs/ folder'`,
	);
	logger(data, state, reason, information);
};

export const validateRequest = async (request: any) => {
	// Check if validation is disabled
	if (process.env.VALIDATE_REQUESTS !== 'ON') {
		return true;
	}

	let requestTemplate: { default: JSON[] } | undefined;

	// Load request template if one exists otherwise fail validation
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		requestTemplate = (await import(
			/* @vite-ignore */
			`../request-templates/${process.env.LLM_NAME ?? 'openai'}_req.json`,
			{
				assert: { type: 'json' },
			}
		)) as { default: JSON[] };
	} catch {
		console.log('INTERNAL ERROR: No request template found');
		logRequestBody({
			data: request.body,
			state: 'FAILED',
			reason: 'MISSING LLM REQUEST TEMPLATE',
			information: 'Add LLM template in request-templates folder',
		});
		return false;
	}

	// Check request has a body and it is an object
	if (typeof request.body !== 'object' || request.body === null) {
		console.log('ERROR: missing request body');
		logRequestBody({
			data: 'Missing or invalid request body',
			state: 'FAILED',
			reason: 'INVALID REQUEST',
			information: 'Missing or Invalid Request Body',
		});
		return false;
	}

	// For Fastify, the body is already parsed
	const data = request.body;

	// Log Request if LOG_REQUESTS=ON
	logRequestBody({
		data,
		state: 'PASSED',
		reason: 'REQUEST STRUCTURE OK',
		information: 'request structure matches template',
	});

	const requiredKeys = Object.keys(requestTemplate.default[0]);

	if (typeof data !== 'object' || data === null) {
		logRequestBody({
			data: request?.body,
			state: 'FAILED',
			reason: 'INVALID REQUEST BODY',
			information: 'data must not be null and must be an object',
		});
		return false;
	}

	const requestKeys = Object.keys(data);

	let missingKeys = false;
	const missingKeyInformation: string[] = [];

	for (const key of requiredKeys) {
		if (!requestKeys.includes(key)) {
			missingKeys = true;
			missingKeyInformation.push(key.toUpperCase());
		}
	}

	if (missingKeys) {
		logRequestBody({
			data,
			state: 'FAILED',
			reason: 'INVALID / MISSING KEY(S)',
			information: `missing keys: ${missingKeyInformation.join(' , ')}`,
		});
		return false;
	}

	return true;
};
