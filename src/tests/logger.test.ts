/* eslint-disable  @typescript-eslint/naming-convention */
import { expect, test, describe, vi, afterEach } from 'vitest';
import { type DefaultBodyType, type StrictRequest } from 'msw';
import { validateRequest } from '../utilities/validate-request.js';

// Mock out imported logger function
vi.mock('../utilities/logger.js');

afterEach(() => {
    vi.resetAllMocks();
});

describe('logging works as expected', async () => {
    test('validate function returns expected data to logger function', async () => {
        process.env.VALIDATE_REQUESTS = 'ON';
        process.env.LOG_REQUESTS = 'ON';

        // Create instance of mocked logger function imported into validateRequest
        const logger = await import('../utilities/logger.js');
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
        // Check mocked logger is called with expected arguments
        expect(logger.default).toHaveBeenCalledWith(
            {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                n: 1,
                stream: false,
            },
            'FAILED',
            'INVALID / MISSING KEY(S)',
            'missing keys: MODEL , MESSAGES',
        );

        expect(validationResult).toBe(false);
    });
});
