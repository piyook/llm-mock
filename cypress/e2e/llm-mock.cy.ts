const chatGPTSchema = {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    properties: {
        id: {
            type: 'string',
        },
        object: {
            type: 'string',
        },
        created: {
            type: 'integer',
        },
        model: {
            type: 'string',
        },
        usage: {
            type: 'object',
            properties: {
                prompt_tokens: {
                    type: 'integer',
                },
                completion_tokens: {
                    type: 'integer',
                },
                total_tokens: {
                    type: 'integer',
                },
            },
            required: ['prompt_tokens', 'completion_tokens', 'total_tokens'],
        },
        choices: {
            type: 'array',
            items: [
                {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'object',
                            properties: {
                                role: {
                                    type: 'string',
                                },
                                content: {
                                    type: 'string',
                                },
                            },
                            required: ['role', 'content'],
                        },
                        finish_reason: {
                            type: 'string',
                        },
                        index: {
                            type: 'integer',
                        },
                    },
                    required: ['message', 'finish_reason', 'index'],
                },
            ],
        },
    },
    required: ['id', 'object', 'created', 'model', 'usage', 'choices'],
};

describe('Mock LLM Spec for chatGPT', () => {
    process.env.VALIDATE_REQUESTS = 'ON';

    const requestData = {
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
    };
    const invalidRequestData = {
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
    };

    it('should be up and running', () => {
        cy.visit('/');
        cy.get('[data-cy="title"]').should(
            'have.text',
            ' Mock LLM Server: Running',
        );
    });

    it('checks server is running and serving data', () => {
        cy.request('/chatgpt/chat/completions').then((response) => {
            expect(response.status).to.eq(200);
        });
    });

    it('should validate JSON against schema for a GET Request', () => {
        cy.request('GET', '/chatgpt/chat/completions').then((response) => {
            expect(response.body).to.be.jsonSchema(chatGPTSchema);
        });
    });

    it('should validate JSON against schema for a POST with correct request format', () => {
        cy.request('POST', '/chatgpt/chat/completions', requestData).then(
            (response) => {
                expect(response.body).to.be.jsonSchema(chatGPTSchema);
            },
        );
    });

    it('should return error for a POST with incorrect request format', () => {
        cy.request({
            method: 'POST',
            url: '/chatgpt/chat/completions',
            body: invalidRequestData,
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(400);
            expect(response.body).to.contain(
                'Invalid or Missing Request For this LLM Model: CHATGPT',
            );
        });
    });
});
