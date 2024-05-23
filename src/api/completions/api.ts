/* eslint-disable @typescript-eslint/naming-convention */
import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';
import { db } from '../../models/db.js';

// Add any http handler here (get, push , delete etc., and middleware as needed)

let dataResponseCount = 0;

const mockGPTResponse = () => {
    let content = '';

    switch (process.env?.MOCK_GPT_MODE) {
        case 'lorem': {
            content = faker.lorem.sentences({
                min: 1,
                max: Number.parseInt(process.env?.MAX_LOREM_PARAS ?? '5', 10),
            });
            break;
        }

        case 'stored': {
            const storedResponses = db.gpt.getAll();

            dataResponseCount =
                dataResponseCount > storedResponses.length - 1
                    ? 0
                    : dataResponseCount;
            content = storedResponses[dataResponseCount].content;
            dataResponseCount++;
            console.log({ dataResponseCount });
            break;
        }

        default: {
            content = faker.lorem.paragraphs({ min: 1, max: 10 });
        }
    }

    return {
        id: 'chatcmpl-6wJZ9Ebt8puAO4zW3zUpgFwS8BfJB',
        object: 'chat.completion',
        created: 1_679_356_255,
        model: 'gpt-3.5-turbo-0301',
        usage: {
            prompt_tokens: 45,
            completion_tokens: 19,
            total_tokens: 64,
        },
        choices: [
            {
                message: {
                    role: 'assistant',
                    content,
                },
                finish_reason: 'stop',
                index: 0,
                logprobs: null,
            },
        ],
    };
};

function handler(pathName: string) {
    return [
        http.get(`/${pathName}`, ({ request }) => {
            return HttpResponse.json(mockGPTResponse());
        }),
        http.post(`/${pathName}`, ({ request }) => {
            return HttpResponse.json(mockGPTResponse());
        }),
    ];
}

export default handler;
