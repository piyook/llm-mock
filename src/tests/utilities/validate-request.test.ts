/* eslint-disable  @typescript-eslint/naming-convention */
import { expect, test, describe } from 'vitest';
import { validateRequest } from '../../utilities/validate-request.js';

describe('validation function works as expected', async () => {
	test('passes with correct request', async () => {
		process.env.VALIDATE_REQUESTS = 'ON';
		process.env.LOG_REQUESTS = 'OFF';
		const request = {
			body: {
				model: 'gpt-3.5-turbo',
				temperature: 1,
				top_p: 1,
				frequency_penalty: 0,
				presence_penalty: 0,
				n: 1,
				stream: false,
				messages: [
					{
						role: 'user',
						content: 'Hello, how are you?',
					},
				],
			},
		} as any;

		const validationResult = await validateRequest(request);

		expect(validationResult).toBe(true);
	});

	test('fails with incorrect request', async () => {
		process.env.VALIDATE_REQUESTS = 'ON';
		process.env.LOG_REQUESTS = 'OFF';
		const request = {
			body: {
				// Remove model from request to fail validation.
				temperature: 1,
				top_p: 1,
				frequency_penalty: 0,
				presence_penalty: 0,
				n: 1,
				stream: false,
				// Remove messages from request to fail validation.
			},
		} as any;

		const validationResult = await validateRequest(request);

		expect(validationResult).toBe(false);
	});
});
