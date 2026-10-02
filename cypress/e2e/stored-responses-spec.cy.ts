// Runs against the `stored` preset of .llmockrc.test.json: claude format,
// responseType "stored" with its own storedResponsesFile.
describe('Mock LLM Spec for configured stored responses', () => {
    const url = '/v1/messages';
    const storedPath = 'cypress/fixtures/mock-rules/stored-replies.json';

    const body = (text: string, extra = {}) => ({
        model: 'claude-opus-5-5',
        max_tokens: 256,
        messages: [{ role: 'user', content: text }],
        ...extra,
    });

    // The file mixes plain strings and { content } objects
    const texts = (entries: Array<string | { content: string }>) =>
        entries.map((entry) =>
            typeof entry === 'string' ? entry : entry.content,
        );

    it('should be up and running', () => {
        cy.request('/ping').its('status').should('eq', 200);
    });

    it('reports the size of the configured pool to the dashboard', () => {
        cy.readFile(storedPath).then((entries) => {
            cy.request('/ui-meta')
                .its('body.storedResponsesCount')
                .should('eq', entries.length);
        });
    });

    it('shows the llmock version on the dashboard', () => {
        cy.readFile('package.json').then((pkg) => {
            cy.visit('/');
            cy.get('[cy-data="llmock_version"]').should(
                'contain',
                `v${pkg.version}`,
            );
        });
    });

    it('opens the request log in the dashboard viewer', () => {
        cy.visit('/');
        cy.get('[cy-data="request_log_link"]').click();
        cy.get('[cy-data="viewer"]').should('contain', 'Last logged request');
        cy.get('[cy-data="viewer_text"]').should('have.length', 1);
    });

    it('shows the configured pool in the dashboard viewer', () => {
        cy.readFile(storedPath).then((entries) => {
            cy.visit('/');
            cy.get('[cy-data="stored_responses_link"]')
                .should('contain', storedPath)
                .click();
            cy.get('[cy-data="viewer_text"]').should(
                'have.length',
                entries.length,
            );
            texts(entries).forEach((text) => {
                cy.get('[cy-data="viewer"]').should('contain', text);
            });
        });
    });

    it('lists the response rules on the dashboard and shows a rule file', () => {
        cy.readFile('cypress/fixtures/mock-rules/plain-reply.txt').then(
            (expected) => {
                cy.visit('/');
                cy.get('[cy-data="response_rules"]').should(
                    'contain',
                    'E2E_FIXTURE_TEXT',
                );
                cy.get('[cy-data="rule_file_link"]').click();
                cy.get('[cy-data="viewer_text"]').should(
                    'have.text',
                    expected,
                );
            },
        );
    });

    it('replies with texts from the configured file', () => {
        cy.readFile(storedPath).then((entries) => {
            const pool = texts(entries);

            Cypress._.times(8, () => {
                cy.request({ method: 'POST', url, body: body('Hello') }).then(
                    (response) => {
                        expect(response.status).to.eq(200);
                        expect(response.body.type).to.eq('message');
                        expect(pool).to.include(response.body.content[0].text);
                    },
                );
            });
        });
    });

    it('streams a text from the configured file', () => {
        cy.readFile(storedPath).then((entries) => {
            cy.request({
                method: 'POST',
                url,
                body: body('Hello', { stream: true }),
            }).then((response) => {
                const text = (response.body as string)
                    .split('\n\n')
                    .filter((block) => block.trim().length > 0)
                    .map((block) =>
                        JSON.parse(block.split('\n')[1].replace('data: ', '')),
                    )
                    .filter((data) => data.type === 'content_block_delta')
                    .map((data) => data.delta.text)
                    .join('');

                expect(texts(entries)).to.include(text);
            });
        });
    });

    it('lets a matching response rule win over stored responses', () => {
        cy.readFile('cypress/fixtures/mock-rules/plain-reply.txt').then(
            (expected) => {
                cy.request({
                    method: 'POST',
                    url,
                    body: body('please answer E2E_FIXTURE_TEXT'),
                }).then((response) => {
                    expect(response.body.content[0].text).to.eq(expected);
                });
            },
        );
    });
});
