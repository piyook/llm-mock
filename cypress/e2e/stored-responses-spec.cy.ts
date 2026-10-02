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

    it('shows how many requests the log keeps and how to change it', () => {
        cy.request('/ui-meta')
            .its('body.maxLoggedRequests')
            .then((max) => {
                cy.visit('/');
                cy.get('[cy-data="max_logged_requests"]').should(
                    'contain',
                    max,
                );
                cy.get('[cy-data="max_logged_requests_note"]')
                    .should('contain', `last ${max} requests`)
                    .and('contain', 'maxLoggedRequests');
            });
    });

    it('opens the request log in the dashboard viewer', () => {
        cy.visit('/');
        cy.get('[cy-data="request_log_link"]').click();
        cy.get('[cy-data="viewer"]').should('contain', 'Last logged requests');
        cy.get('[cy-data="viewer_text"]').should('have.length', 1);
    });

    // The log routes are stubbed, so the real log file is never touched
    it('pages through the logged requests one at a time and clears them', () => {
        let log: Array<{ sent_POST_request: string }> | null = [
            { sent_POST_request: 'newest request' },
            { sent_POST_request: 'middle request' },
            { sent_POST_request: 'oldest request' },
        ];
        cy.intercept('GET', '/ui-request-log', (req) => {
            req.reply({ body: { file: 'api_request_log.json', log } });
        });
        cy.intercept('DELETE', '/ui-request-log', (req) => {
            log = null;
            req.reply({ body: { file: 'api_request_log.json', log } });
        }).as('clear');

        cy.visit('/');
        cy.get('[cy-data="request_log_link"]').click();

        cy.get('[cy-data="viewer_text"]')
            .should('have.length', 1)
            .and('contain', 'newest request');
        cy.get('[cy-data="viewer_position"]').should('contain', '1 of 3');
        // This preset has logRequests off, so the entries are from earlier
        cy.get('[cy-data="viewer"]').should(
            'contain',
            'logging is off, these were logged earlier',
        );
        cy.get('[cy-data="viewer_back"]').should('be.disabled');

        cy.get('[cy-data="viewer_next"]').click().click();
        cy.get('[cy-data="viewer_text"]').should('contain', 'oldest request');
        cy.get('[cy-data="viewer_position"]').should('contain', '3 of 3');
        cy.get('[cy-data="viewer_next"]').should('be.disabled');

        cy.get('[cy-data="viewer_back"]').click();
        cy.get('[cy-data="viewer_text"]').should('contain', 'middle request');

        // Nothing is cleared until the question is answered
        cy.get('[cy-data="viewer_clear"]').click();
        cy.get('[cy-data="viewer"]').should(
            'contain',
            'Clear all logged requests?',
        );
        cy.get('[cy-data="viewer_clear_confirm"]').click();
        cy.wait('@clear');

        cy.get('[cy-data="viewer_text"]').should(
            'contain',
            'No request has been logged yet',
        );
        cy.get('[cy-data="viewer_clear"]').should('not.exist');
        cy.get('[cy-data="viewer_position"]').should('not.exist');
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
                cy.get('[cy-data="response_rules_count"]').should(
                    'contain',
                    '1 rule',
                );
                cy.get('[cy-data="rule_file_link"]').click();
                cy.get('[cy-data="viewer_text"]').should(
                    'have.text',
                    expected,
                );
            },
        );
    });

    it('leaves a short list of rules and of stored responses unscrolled', () => {
        cy.visit('/');
        cy.get('[cy-data="response_rules"] .rules').should(
            'not.have.class',
            'scrollList',
        );
        cy.get('[cy-data="stored_responses_link"]').click();
        cy.get('[cy-data="viewer_text"]').should('exist');
        cy.get('[cy-data="viewer"] .viewerTexts').should(
            'not.have.class',
            'scrollList',
        );
    });

    // The dashboard routes are stubbed to return more than four of each
    it('scrolls a long list of rules and of stored responses inside a fixed window', () => {
        const scrolls = ($list: JQuery<HTMLElement>) => {
            expect($list).to.have.class('scrollList');
            expect($list[0].scrollHeight).to.be.greaterThan(
                $list[0].clientHeight,
            );
        };
        const responseRules = Cypress._.times(6, (i) => ({
            match: `match ${i + 1}`,
            files: [`reply-${i + 1}.txt`],
        }));
        const responses = Cypress._.times(6, (i) =>
            `Stored reply ${i + 1}. `.repeat(40),
        );
        cy.intercept('GET', '/ui-meta', (req) => {
            req.continue((res) => {
                res.body = { ...res.body, responseRules };
            });
        });
        cy.intercept('GET', '/ui-stored-responses', {
            body: { file: storedPath, responses },
        });

        cy.visit('/');
        cy.get('[cy-data="response_rules_count"]').should(
            'contain',
            '6 rules',
        );
        cy.get('[cy-data="rule_file_link"]').should('have.length', 6);
        cy.get('[cy-data="response_rules"] .rules').should(scrolls);

        cy.get('[cy-data="stored_responses_link"]').click();
        cy.get('[cy-data="viewer_text"]').should('have.length', 6);
        cy.get('[cy-data="viewer"] .viewerTexts').should(scrolls);
    });

    it('keeps the close button on one line beside a long viewer title', () => {
        const match = 'a long match phrase that fills the viewer title '.repeat(
            3,
        );
        cy.intercept('GET', '/ui-meta', (req) => {
            req.continue((res) => {
                res.body = {
                    ...res.body,
                    responseRules: [{ match, files: ['reply.txt'] }],
                };
            });
        });
        cy.intercept('GET', '/ui-rule-file*', {
            body: { file: 'reply.txt', content: 'A reply.' },
        });

        cy.viewport(360, 640);
        cy.visit('/');
        cy.get('[cy-data="rule_file_link"]').click();
        cy.get('[cy-data="viewer_text"]').should('have.text', 'A reply.');
        cy.get('[cy-data="viewer"] .viewerHeader .fileLink')
            .should('have.text', 'Close')
            .and('have.css', 'white-space', 'nowrap')
            .invoke('outerHeight')
            .should('be.lessThan', 40);
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
