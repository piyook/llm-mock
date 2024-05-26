/* eslint-disable @typescript-eslint/naming-convention */
import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';
import { db } from '../../models/db.js';
import { buildResponse } from '../../utilities/build-response.js';
import { validateRequest } from '../../utilities/validate-request.js';

// Add any http handler here (get, push , delete etc., and middleware as needed)

let dataResponseCount = 0;

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

    return buildResponse(content);
};

function handler(pathName: string) {
    return [
        http.get(`/${pathName}`, async ({ request }) => {
            return HttpResponse.json(await mockGPTResponse());
        }),
        http.post(`/${pathName}`, async ({ request }) => {
            if (await validateRequest(request)) {
                return HttpResponse.json(await mockGPTResponse());
            }

            console.log(
                `\nREQUEST ERROR: Invalid or missing request format for this LLM Model:${process.env?.LLM_NAME?.toUpperCase()}`,
            );

            return new HttpResponse(
                `Invalid or Missing Request For this LLM Model: ${process.env?.LLM_NAME?.toUpperCase()}`,
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                },
            );
        }),
    ];
}

export default handler;
