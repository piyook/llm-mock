/* eslint-disable @typescript-eslint/naming-convention */
import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';
import { db } from '../../models/db.js';

// Add any http handler here (get, push , delete etc., and middleware as needed)

let dataResponseCount = 0;

const chatTemplate = (await import(
    `../../response-templates/${process.env.LLM_NAME ?? 'chatgpt'}_chat.json`,
    {
        assert: { type: 'json' },
    }
)) as { default: JSON[] };

console.log(chatTemplate);
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

    const newResponse = JSON.parse(
        JSON.stringify(chatTemplate.default[0]).replace(
            /DYNAMIC_CONTENT_HERE/,
            content,
        ),
    ) as JSON;

    return newResponse;
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
