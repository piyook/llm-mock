/* eslint-disable  @typescript-eslint/naming-convention */
import { expect, test, describe, vi } from 'vitest';
import { type DefaultBodyType, type StrictRequest } from 'msw';
import { validateRequest } from '../utilities/validate-request.js';

process.env.VALIDATE_REQUESTS = 'ON';
process.env.LOG_REQUESTS = 'OFF';

describe('Test utilities', async () => {
    test('test validate request passes correct request', async () => {
        process.env.VALIDATE_REQUESTS = 'ON';
        process.env.LOG_REQUESTS = 'OFF';
        const request = {
            async json() {
                return new Promise((resolve) => {
                    resolve({
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
                    });
                });
            },
            body: { test: 'dummy body data' },
        } as unknown as StrictRequest<DefaultBodyType>;

        const validationResult = await validateRequest(request);

        expect(validationResult).toBe(true);
    });

    test('test validate request fails for incorrect request', async () => {
        process.env.VALIDATE_REQUESTS = 'ON';
        process.env.LOG_REQUESTS = 'OFF';
        const request = {
            async json() {
                return new Promise((resolve) => {
                    resolve({
                        // Remove model from request to fail validation.
                        temperature: 1,
                        top_p: 1,
                        frequency_penalty: 0,
                        presence_penalty: 0,
                        n: 1,
                        stream: false,
                        // Remove messages from request to fail validation.
                    });
                });
            },
            body: { test: 'dummy body data' },
        } as unknown as StrictRequest<DefaultBodyType>;

        const validationResult = await validateRequest(request);

        expect(validationResult).toBe(false);
    });
});
