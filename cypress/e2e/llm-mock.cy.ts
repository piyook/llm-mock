describe('Mock LLM Spec', () => {
    it('should be up and running', () => {
        cy.visit('http://localhost:8001');
        cy.get('[data-cy="title"]').should(
            'have.text',
            ' Mock LLM Server: Running',
        );
    });

    it('provides expected response for GET request to chatGPT endpoint', () => {
        cy.request('GET', '/chatgpt/chat/completions').then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('id');
            expect(response.body).to.have.property('choices');
            expect(response.body).to.have.property('created');
            expect(response.body).to.have.property('model');
            expect(response.body).to.have.property('usage');

            const usage = response.body.usage;
            const choices = response.body.choices;
            expect(usage.prompt_tokens).to.be.equal(12);
            expect(usage.completion_tokens).to.be.equal(99);
            expect(usage.total_tokens).to.be.equal(111);
            expect(choices[0].finish_reason).to.be.equal('stop');
            expect(choices[0].index).to.be.equal(0);
            expect(choices[0].message.role).to.be.equal('assistant');
            expect(choices[0].message.content.length).to.be.greaterThan(1);
        });
    });

    it('provides expected response for POST request to chatGPT endpoint', () => {
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
        process.env.VALIDATE_REQUESTS = 'OFF';
        cy.request('POST', '/chatgpt/chat/completions', requestData).then(
            (response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.have.property('id');
                expect(response.body).to.have.property('choices');
                expect(response.body).to.have.property('created');
                expect(response.body).to.have.property('model');
                expect(response.body).to.have.property('usage');

                const usage = response.body.usage;
                const choices = response.body.choices;
                expect(usage.prompt_tokens).to.be.equal(12);
                expect(usage.completion_tokens).to.be.equal(99);
                expect(usage.total_tokens).to.be.equal(111);
                expect(choices[0].finish_reason).to.be.equal('stop');
                expect(choices[0].index).to.be.equal(0);
                expect(choices[0].message.role).to.be.equal('assistant');
                expect(choices[0].message.content.length).to.be.greaterThan(1);
            },
        );
    });
});
