const geminiSchema = {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    properties: {
        candidates: {
            type: 'array',
            items: [
                {
                    type: 'object',
                    properties: {
                        content: {
                            type: 'object',
                            properties: {
                                parts: {
                                    type: 'array',
                                    items: [
                                        {
                                            type: 'object',
                                            properties: {
                                                text: {
                                                    type: 'string',
                                                },
                                            },
                                            required: ['text'],
                                        },
                                    ],
                                },
                                role: {
                                    type: 'string',
                                },
                            },
                            required: ['parts', 'role'],
                        },
                        finishReason: {
                            type: 'string',
                        },
                        index: {
                            type: 'integer',
                        },
                        safetyRatings: {
                            type: 'array',
                            items: [
                                {
                                    type: 'object',
                                    properties: {
                                        category: {
                                            type: 'string',
                                        },
                                        probability: {
                                            type: 'string',
                                        },
                                    },
                                    required: ['category', 'probability'],
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        category: {
                                            type: 'string',
                                        },
                                        probability: {
                                            type: 'string',
                                        },
                                    },
                                    required: ['category', 'probability'],
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        category: {
                                            type: 'string',
                                        },
                                        probability: {
                                            type: 'string',
                                        },
                                    },
                                    required: ['category', 'probability'],
                                },
                                {
                                    type: 'object',
                                    properties: {
                                        category: {
                                            type: 'string',
                                        },
                                        probability: {
                                            type: 'string',
                                        },
                                    },
                                    required: ['category', 'probability'],
                                },
                            ],
                        },
                    },
                    required: [
                        'content',
                        'finishReason',
                        'index',
                        'safetyRatings',
                    ],
                },
            ],
        },
    },
    required: ['candidates'],
};

describe('Mock LLM Spec for Google Gemini', () => {
    const llmUrl = 'models/gemini-pro:generateContent';
    process.env.VALIDATE_REQUESTS = 'ON';
    process.env.LLM_NAME = 'gemini';
    process.env.LLM_URL_ENDPOINT = llmUrl;

    const requestData = {
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        text: 'Write the first line of a story about an API developer.',
                    },
                ],
            },
            {
                role: 'model',
                parts: [
                    {
                        text: 'In the bustling city of Meadow brook, lived a young boy named Alan. He was a bright and curious soul with an imaginative mind.',
                    },
                ],
            },
            {
                role: 'user',
                parts: [
                    {
                        text: 'Can you set it in a quiet village in 2010s Kenya?',
                    },
                ],
            },
        ],
        safety_settings: {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_LOW_AND_ABOVE',
        },
        generation_config: {
            temperature: 0.2,
            topP: 0.8,
            topK: 40,
        },
    };
    const invalidRequestData = {
        safety_settings: {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_LOW_AND_ABOVE',
        },
        generation_config: {
            temperature: 0.2,
            topP: 0.8,
            topK: 40,
        },
    };

    it('should be up and running', () => {
        cy.visit('/');
        cy.get('[data-cy="title"]').should(
            'have.text',
            ' Mock LLM Server: Running',
        );
    });

    it('checks server is running and serving data', () => {
        cy.request(llmUrl).then((response) => {
            expect(response.status).to.eq(200);
        });
    });

    it('should validate JSON against schema for a GET Request', () => {
        cy.request('GET', llmUrl).then((response) => {
            expect(response.body).to.be.jsonSchema(geminiSchema);
        });
    });

    it('should validate JSON against schema for a POST with correct request format', () => {
        cy.request('POST', llmUrl, requestData).then((response) => {
            expect(response.body).to.be.jsonSchema(geminiSchema);
        });
    });

    it('should return error for a POST with incorrect request format', () => {
        cy.request({
            method: 'POST',
            url: llmUrl,
            body: invalidRequestData,
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(400);
            // expect(response.body).to.contain(
            //     'Invalid or Missing Request For this LLM Model: GEMINI',
            // );
        });
    });
});
