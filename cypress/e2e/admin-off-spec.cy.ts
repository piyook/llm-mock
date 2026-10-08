// Runs against the `claude` preset of .llmockrc.test.json, started with
// --admin=off: the admin API is not served, and the dashboard only shows.
describe('Mock LLM Spec with the admin API off', () => {
    it('reports the admin API as off', () => {
        cy.request('/ui-meta').its('body.adminApi').should('eq', 'DISABLED');
    });

    const routes: Array<[string, string]> = [
        ['GET', '/admin/rules'],
        ['POST', '/admin/rules'],
        ['DELETE', '/admin/rules'],
        ['GET', '/admin/chaos'],
        ['PATCH', '/admin/chaos'],
        ['GET', '/admin/delay'],
        ['PATCH', '/admin/delay'],
        ['GET', '/admin/settings'],
        ['PATCH', '/admin/settings'],
        ['POST', '/admin/reset'],
    ];

    for (const [method, url] of routes) {
        it(`answers 404 for ${method} ${url}`, () => {
            cy.request({
                method,
                url,
                // A change that would be made if the route were there
                ...(method === 'PATCH' || url === '/admin/rules'
                    ? { body: { enabled: true, match: 'A', text: 'b' } }
                    : {}),
                failOnStatusCode: false,
            })
                .its('status')
                .should('eq', 404);
        });
    }

    it('still replies to requests', () => {
        cy.request({
            method: 'POST',
            url: '/v1/messages',
            body: {
                model: 'claude-opus-5-5',
                max_tokens: 256,
                messages: [{ role: 'user', content: 'hello' }],
            },
        })
            .its('status')
            .should('eq', 200);
    });

    it('shows the settings on the dashboard with nothing to change them', () => {
        cy.visit('/');

        cy.get('[cy-data="admin_status"]').should('have.text', 'DISABLED');
        cy.get('[cy-data="admin_note"]').should('contain', 'are off');

        // The values are still there
        cy.get('[cy-data="response_type"]').should('have.text', 'lorem');
        cy.get('[cy-data="response_delay"]').should('have.text', 'Off');
        cy.get('[cy-data="chaos_status"]').should('have.text', 'DISABLED');
        cy.get('[cy-data="max_logged_requests"]').should('be.visible');

        // No switch, no Change button, no Reset
        cy.get('[cy-data^="switch_"]').should('not.exist');
        cy.get('[cy-data^="change_"]').should('not.exist');
        cy.get('[cy-data="admin_reset"]').should('not.exist');
        cy.get('[cy-data="admin_runtime_rules"]').should('not.exist');
    });
});
