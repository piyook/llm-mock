// Runs against the `claude` preset of .llmockrc.test.json, started with
// --recordings=cypress/fixtures/recordings and no upstream: the server only
// replays, and the dashboard shows the recorded rule and the recording state.
describe('Mock LLM Spec replaying recordings', () => {
    const dir = 'cypress/fixtures/recordings';

    it('reports replay only in /ui-meta', () => {
        cy.request('/ui-meta')
            .its('body.recording')
            .should('deep.include', { mode: 'replay', upstream: null, dir });
    });

    it('answers a call from the recording', () => {
        cy.request({
            method: 'POST',
            url: '/v1/messages',
            body: {
                model: 'claude-opus-5-5',
                max_tokens: 100,
                messages: [{ role: 'user', content: 'E2E_RECORDED' }],
            },
        })
            .its('body.content.0.text')
            .should('eq', 'Answer from the recording.');
    });

    it('shows the recording state on the Settings page', () => {
        cy.visit('/#/settings');
        cy.get('[cy-data="recording_status"]').should('have.text', 'REPLAY ONLY');
        cy.get('[cy-data="recording_dir"]').should('have.text', dir);
        cy.get('[cy-data="recording_rules"]').should('contain.text', '1');
        cy.get('[cy-data="recording_upstream"]').should('not.exist');
        cy.get('[cy-data="recording_forwarded"]').should('not.exist');
        cy.get('[cy-data="recording_note"]').should('contain', '--record=<url>');
    });

    it('lists recording on the overview', () => {
        cy.visit('/');
        cy.contains('[cy-data="feature"]', 'Recording')
            .should('contain', 'replay only')
            .and('contain', 'On');
        cy.get('[cy-data="tile_rules"]').should('contain', '1 recorded');
    });

    it('marks the recorded rule, last, and shows its file', () => {
        cy.visit('/#/rules');
        cy.get('[cy-data="rule_recorded"]').should('have.length', 1);
        cy.get('.rule')
            .last()
            .within(() => {
                cy.get('code').should('have.text', 'E2E_RECORDED');
                cy.get('[cy-data="rule_scope"]').should(
                    'contain',
                    'Last message contains',
                );
                cy.get('[cy-data="rule_recorded"]').should('have.text', 'recorded');
                cy.get('[cy-data="rule_file_link"]').click();
            });
        cy.get('[cy-data="viewer_text"]').should(
            'have.text',
            'Answer from the recording.',
        );
    });

    it('shows in the request log which calls were sent to the upstream', () => {
        // A log as a recording server writes it: one call sent on and saved,
        // one answered by llmock
        cy.intercept('GET', '/ui-request-log', {
            body: {
                file: 'api_request_log.json',
                log: [
                    {
                        request_validation: {
                            request_id: 'b',
                            forwarded: { status: 200, saved: true },
                        },
                        sent_POST_request: {},
                    },
                    {
                        request_validation: { request_id: 'a' },
                        sent_POST_request: {},
                    },
                ],
            },
        });

        cy.visit('/');
        cy.get('[cy-data="request_log_link"]').click();
        cy.get('[cy-data="viewer_label"]').should(
            'have.text',
            'Sent to the recording upstream · 200 · saved as a recording',
        );
        cy.get('[cy-data="viewer_next"]').click();
        cy.get('[cy-data="viewer_text"]').should('contain', '"request_id": "a"');
        cy.get('[cy-data="viewer_label"]').should('not.exist');
    });
});
