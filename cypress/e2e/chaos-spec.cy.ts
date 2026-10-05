// Runs against the `chaos` preset of .llmockrc.test.json: claude format with
// chaos on, failing every 2nd call with a 529. The tests share the server's
// call counter, so each one sends an even number of calls and leaves the
// next call as one that succeeds.
describe('Mock LLM Spec for chaos mode', () => {
    const url = '/v1/messages';

    const post = (text = 'Hello', extra = {}) =>
        cy.request({
            method: 'POST',
            url,
            failOnStatusCode: false,
            body: {
                model: 'claude-opus-5-5',
                max_tokens: 256,
                messages: [{ role: 'user', content: text }],
                ...extra,
            },
        });

    it('should be up and running', () => {
        cy.request('/ping').its('status').should('eq', 200);
    });

    it('reports the chaos settings to the dashboard', () => {
        cy.request('/ui-meta').its('body').should('include', {
            chaosStatus: 'ENABLED',
            chaosFrequency: 2,
            chaosMode: 'every',
            chaosErrorStatus: 529,
        });
    });

    it('fails every 2nd call with the configured error', () => {
        post().then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.type).to.eq('message');
            expect(response.headers).not.to.have.property('x-llmock-chaos');
        });

        post().then((response) => {
            expect(response.status).to.eq(529);
            expect(response.body).to.deep.eq({
                type: 'error',
                error: {
                    type: 'overloaded_error',
                    message: 'llmock chaos: simulated 529 error',
                },
            });
            expect(response.headers['x-llmock-chaos']).to.eq('true');
            expect(response.headers['retry-after']).to.eq('1');
        });

        post().its('status').should('eq', 200);
        post().its('status').should('eq', 529);
    });

    it('fails a streamed call with a JSON error and no stream', () => {
        post('Hello', { stream: true }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.headers['content-type']).to.contain(
                'text/event-stream',
            );
        });

        post('Hello', { stream: true }).then((response) => {
            expect(response.status).to.eq(529);
            expect(response.headers['content-type']).to.contain(
                'application/json',
            );
            expect(response.body.error.type).to.eq('overloaded_error');
        });
    });

    it('counts embeddings calls too, failing them with an OpenAI error', () => {
        const embed = () =>
            cy.request({
                method: 'POST',
                url: '/v1/embeddings',
                failOnStatusCode: false,
                body: { model: 'text-embedding-3-small', input: 'Hello' },
            });

        embed().its('status').should('eq', 200);
        embed().then((response) => {
            expect(response.status).to.eq(529);
            expect(response.body.error.type).to.eq('server_error');
        });
    });

    it('does not count an invalid request, which still gets a 400', () => {
        cy.request({
            method: 'POST',
            url,
            failOnStatusCode: false,
            body: { nothing: 'useful' },
        })
            .its('status')
            .should('eq', 400);

        // Still one success then one failure
        post().its('status').should('eq', 200);
        post().its('status').should('eq', 529);
    });

    it('never fails the dashboard routes', () => {
        Cypress._.times(4, () => {
            cy.request('/ping').its('status').should('eq', 200);
            cy.request('/ui-meta').its('status').should('eq', 200);
        });
    });

    it('shows the chaos settings and a rising error count on the dashboard', () => {
        cy.request('/ui-meta')
            .its('body.chaosInjected')
            .then((injected: number) => {
                cy.visit('/');
                cy.get('[cy-data="chaos_status"]').should('contain', 'ENABLED');
                cy.get('[cy-data="chaos_frequency"]').should(
                    'contain',
                    'Every 2 calls',
                );
                cy.get('[cy-data="chaos_error_status"]').should(
                    'contain',
                    '529',
                );
                cy.get('[cy-data="chaos_injected"]').should(
                    'have.text',
                    String(injected),
                );
                cy.get('[cy-data="chaos_note"]').should(
                    'contain',
                    '--chaos=true',
                );

                post().its('status').should('eq', 200);
                post().its('status').should('eq', 529);

                // The dashboard polls every 2 seconds
                cy.get('[cy-data="chaos_injected"]').should(
                    'have.text',
                    String(injected + 1),
                );
            });
    });
});
