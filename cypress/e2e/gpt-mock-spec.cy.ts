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
    process.env.LLM_NAME = 'chatgpt';
    process.env.LLM_URL_ENDPOINT = 'chatgpt/chat/completions';

    const requestData = {
        model: 'gpt-4o',
        temperature: 1,
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
        cy.request('/ping').then((response) => {
            expect(response.status).to.eq(200);
        });
    });

    it('checks server is running and serving data', () => {
        cy.request('/chatgpt/chat/completions').then((response) => {
            expect(response.status).to.eq(200);
        });
    });

    it('shows an empty response rules box on the dashboard when no rules are set', () => {
        cy.visit('/');
        cy.get('[cy-data="response_rules_empty"]').should(
            'contain',
            'No response rules set',
        );
        cy.get('[cy-data="rule_file_link"]').should('not.exist');
        cy.get('[cy-data="response_rules_count"]').should('contain', '0 rules');
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
                'Invalid or Missing Request For This LLM Model Template: OPENAI Model:gpt-4o. Please ensure your request adheres to the expected format - see localhost:8001/ui-request-log for details of missing parameters or formatting issues.',
            );
        });
    });

    // This template goes by the server's streaming setting, so the dashboard
    // has a switch for it (the claude template has none)
    describe('the streaming switch on the dashboard', () => {
        const reset = () => cy.request({ method: 'POST', url: '/admin/reset' });
        const ask = () =>
            cy.request('POST', '/chatgpt/chat/completions', requestData);

        beforeEach(reset);
        after(reset);

        it('turns streaming on for the next request, and off again', () => {
            cy.visit('/');
            cy.get('[cy-data="streaming_status"]').should('contain', 'DISABLED');
            ask().its('body').should('be.jsonSchema', chatGPTSchema);

            cy.get('[cy-data="switch_streaming"]')
                .should('contain', 'Turn on')
                .click();
            cy.get('[cy-data="streaming_status"]').should('contain', 'ENABLED');
            cy.request('/admin/settings')
                .its('body.settings.stream')
                .should('eq', true);

            // Asked from the page: cy.request does not keep a streamed body
            cy.window()
                .then((win) =>
                    win
                        .fetch('/chatgpt/chat/completions', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify(requestData),
                        })
                        .then((response) => response.text()),
                )
                .then((stream) => {
                    expect(stream).to.contain('data: ');
                    expect(stream).to.contain('chat.completion.chunk');
                    expect(stream).to.contain('[DONE]');
                });

            cy.get('[cy-data="switch_streaming"]')
                .should('contain', 'Turn off')
                .click();
            cy.get('[cy-data="streaming_status"]').should('contain', 'DISABLED');
            ask().its('body').should('be.jsonSchema', chatGPTSchema);
        });
    });
});
