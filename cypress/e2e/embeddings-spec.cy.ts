const embeddingsSchema = {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    properties: {
        object: {
            type: 'string',
            enum: ['list'],
        },
        data: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    object: {
                        type: 'string',
                        enum: ['embedding'],
                    },
                    index: {
                        type: 'integer',
                    },
                    embedding: {
                        type: 'array',
                        items: {
                            type: 'number',
                        },
                    },
                },
                required: ['object', 'index', 'embedding'],
            },
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
                total_tokens: {
                    type: 'integer',
                },
            },
            required: ['prompt_tokens', 'total_tokens'],
        },
    },
    required: ['object', 'data', 'model', 'usage'],
};

describe('Mock LLM Embeddings Spec', () => {
    process.env.VALIDATE_REQUESTS = 'ON';
    process.env.LLM_NAME = 'openai';
    process.env.ENABLE_EMBEDDINGS_MOCK = 'true';
    process.env.EMBEDDING_DIMENSION = '128';

    const validRequestData = {
        model: 'text-embedding-ada-002',
        input: 'Hello world',
    };

    const multipleInputsRequestData = {
        model: 'text-embedding-ada-002',
        input: ['First input', 'Second input', 'Third input'],
    };

    const invalidRequestData = {
        // Missing required 'model' field
        input: 'Hello world',
    };

    const customDimensionsRequestData = {
        model: 'text-embedding-ada-002',
        input: 'Test custom dimensions',
        dimensions: 256,
    };

    it('should be up and running', () => {
        cy.visit('/');
        cy.get('[cy-data="server_status"]').contains('Running');
    });

    it('should serve embeddings endpoint', () => {
        cy.request('/v1/embeddings').then((response) => {
            expect(response.status).to.eq(200);
        });
    });

    it('should validate JSON against schema for a GET Request', () => {
        cy.request('GET', '/v1/embeddings').then((response) => {
            expect(response.body).to.be.jsonSchema(embeddingsSchema);
            expect(response.body.object).to.eq('list');
            expect(response.body.data).to.be.an('array');
            expect(response.body.data).to.have.length(1);
            expect(response.body.data[0].object).to.eq('embedding');
            expect(response.body.data[0].index).to.eq(0);
            expect(response.body.data[0].embedding).to.be.an('array');
            expect(response.body.data[0].embedding).to.have.length(128); // default dimension
            expect(response.body.model).to.be.a('string');
            expect(response.body.usage).to.be.an('object');
            expect(response.body.usage.prompt_tokens).to.be.a('number');
            expect(response.body.usage.total_tokens).to.be.a('number');
        });
    });

    it('should validate JSON against schema for a POST with single input', () => {
        cy.request('POST', '/v1/embeddings', validRequestData).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.be.jsonSchema(embeddingsSchema);
            expect(response.body.object).to.eq('list');
            expect(response.body.data).to.have.length(1);
            expect(response.body.data[0].index).to.eq(0);
            expect(response.body.data[0].embedding).to.have.length(128);
            expect(response.body.model).to.eq('text-embedding-ada-002');
        });
    });

    it('should handle multiple inputs correctly', () => {
        cy.request('POST', '/v1/embeddings', multipleInputsRequestData).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.be.jsonSchema(embeddingsSchema);
            expect(response.body.data).to.have.length(3);
            
            // Check proper indexing
            expect(response.body.data[0].index).to.eq(0);
            expect(response.body.data[1].index).to.eq(1);
            expect(response.body.data[2].index).to.eq(2);
            
            // Check all embeddings have same dimension
            expect(response.body.data[0].embedding).to.have.length(128);
            expect(response.body.data[1].embedding).to.have.length(128);
            expect(response.body.data[2].embedding).to.have.length(128);
            
            // Check token usage reflects multiple inputs
            expect(response.body.usage.prompt_tokens).to.be.greaterThan(2);
            expect(response.body.usage.total_tokens).to.eq(response.body.usage.prompt_tokens);
        });
    });

    it('should handle custom dimensions', () => {
        cy.request('POST', '/v1/embeddings', customDimensionsRequestData).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.data[0].embedding).to.have.length(256);
        });
    });

    it('should be deterministic - same input produces same embedding', () => {
        let firstEmbedding: number[];
        
        // First request
        cy.request('POST', '/v1/embeddings', validRequestData).then((response) => {
            expect(response.status).to.eq(200);
            firstEmbedding = response.body.data[0].embedding;
            
            // Second request with same input
            cy.request('POST', '/v1/embeddings', validRequestData).then((secondResponse) => {
                expect(secondResponse.status).to.eq(200);
                expect(secondResponse.body.data[0].embedding).to.deep.eq(firstEmbedding);
            });
        });
    });

    it('should be deterministic across different models - same input different model produces different embedding', () => {
        let embeddingForModel1: number[];
        let embeddingForModel2: number[];
        
        // First model
        cy.request('POST', '/v1/embeddings', {
            model: 'text-embedding-ada-002',
            input: 'Same input different model'
        }).then((response1) => {
            expect(response1.status).to.eq(200);
            embeddingForModel1 = response1.body.data[0].embedding;
            
            // Second model
            cy.request('POST', '/v1/embeddings', {
                model: 'text-embedding-3-small',
                input: 'Same input different model'
            }).then((response2) => {
                expect(response2.status).to.eq(200);
                embeddingForModel2 = response2.body.data[0].embedding;
                
                // Embeddings should be different
                expect(embeddingForModel2).to.not.deep.eq(embeddingForModel1);
            });
        });
    });

    it('should return error for POST with invalid request format', () => {
        cy.request({
            method: 'POST',
            url: '/v1/embeddings',
            body: invalidRequestData,
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(400);
            expect(response.body).to.contain(
                'Invalid or Missing Request For Embeddings Template'
            );
        });
    });

    it('should handle GET request with query parameters', () => {
        cy.request({
            method: 'GET',
            url: '/v1/embeddings',
            qs: {
                model: 'text-embedding-3-small',
                input: 'GET request test',
                dimensions: 64
            }
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.object).to.eq('list');
            expect(response.body.data).to.have.length(1);
            expect(response.body.data[0].embedding).to.have.length(64);
            expect(response.body.model).to.eq('text-embedding-3-small');
        });
    });

    it('should have reasonable token usage calculation', () => {
        cy.request('POST', '/v1/embeddings', {
            model: 'text-embedding-ada-002',
            input: 'This is a test sentence with multiple words'
        }).then((response) => {
            expect(response.status).to.eq(200);
            // Should count words reasonably (approximately 7 words)
            expect(response.body.usage.prompt_tokens).to.be.gte(5);
            expect(response.body.usage.prompt_tokens).to.be.lte(10);
            expect(response.body.usage.total_tokens).to.eq(response.body.usage.prompt_tokens);
        });
    });
});
