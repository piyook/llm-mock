/* eslint-disable  @typescript-eslint/naming-convention */
import { expect, test, describe, vi } from 'vitest';
import { type DefaultBodyType, type StrictRequest } from 'msw';
import { buildResponse } from '../../utilities/build-response.js';

describe('build response function works as expected', async () => {
    test('provides correct response with correct request', async () => {
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

        const input =
            'Comminor cicuta comprehendo spes auxilium cavus. Contra supellex vix solvo angustus asporto auctor templum. Carpo appositus voluntarius virgo adstringo utique. Cetera uterque curvo commodi usque advoco voluptate. Candidus crapula vetus video pax. Suscipit ager aperio ulciscor veritas volubilis confero brevis alo studio.';

        const response = {
            id: 'chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe',
            object: 'chat.completion',
            created: 1_678_485_525,
            model: 'gpt-3.5-turbo-0301',
            usage: {
                prompt_tokens: 12,
                completion_tokens: 99,
                total_tokens: 111,
            },
            choices: [
                {
                    message: {
                        role: 'assistant',
                        content:
                            'Comminor cicuta comprehendo spes auxilium cavus. Contra supellex vix solvo angustus asporto auctor templum. Carpo appositus voluntarius virgo adstringo utique. Cetera uterque curvo commodi usque advoco voluptate. Candidus crapula vetus video pax. Suscipit ager aperio ulciscor veritas volubilis confero brevis alo studio.',
                    },
                    finish_reason: 'stop',
                    index: 0,
                },
            ],
        };
        const builtResponse = await buildResponse(input);

        expect(builtResponse).toEqual(response);
    });
});
