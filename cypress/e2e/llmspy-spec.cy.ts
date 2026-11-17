// Runs against the `chatgpt` preset of .llmockrc.test.json, started with
// --llmspy: the dashboard shows how to put the server behind LLMSpy, and
// every reply carries an x-llmock-request-id.
describe('Mock LLM Spec with --llmspy', () => {
    const entry = 'llmock-chatgpt=http://127.0.0.1:8001';
    const baseUrl = 'http://127.0.0.1:8080/llmock-chatgpt/chatgpt';

    it('reports the LLMSpy route in /ui-meta', () => {
        cy.request('/ui-meta')
            .its('body.llmspy')
            .should('deep.include', { entry, baseUrl });
    });

    it('shows the upstream entry and base URL on the Connect card', () => {
        cy.visit('/');
        cy.get('[cy-data="llmspy_entry"]').should(
            'have.text',
            `LLMSPY_UPSTREAMS=${entry}`,
        );
        cy.get('[cy-data="llmspy_base_url"]').should('have.text', baseUrl);
        cy.get('[cy-data="connect"]').should('contain', 'Base URL through LLMSpy');
    });

    it('sends a different x-llmock-request-id with each reply', () => {
        const ask = () =>
            cy.request({
                method: 'POST',
                url: '/chatgpt/chat/completions',
                body: {
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'Hello' }],
                },
            });

        ask().then((first) => {
            const id = first.headers['x-llmock-request-id'];
            expect(id).to.match(/^[0-9a-f-]{36}$/);
            ask().its('headers.x-llmock-request-id').should('not.eq', id);
        });
    });
});
