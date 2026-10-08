// Runs against the `claude` preset of .llmockrc.test.json, which has its own
// responseRules (E2E_FIXTURE_TEXT replies with plain-reply.txt).
describe('Mock LLM Spec for the admin API', () => {
    const url = '/v1/messages';

    const body = (text: string, extra = {}) => ({
        model: 'claude-opus-5-5',
        max_tokens: 256,
        messages: [{ role: 'user', content: text }],
        ...extra,
    });

    const addRule = (rule: object) =>
        cy.request({ method: 'POST', url: '/admin/rules', body: rule });

    const ask = (text: string) =>
        cy.request({ method: 'POST', url, body: body(text) });

    const reset = () => cy.request({ method: 'POST', url: '/admin/reset' });

    beforeEach(reset);
    after(reset);

    it('lists the config file rules before any rule is added', () => {
        cy.request('/admin/rules').then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.rules).to.have.length(6);
            for (const rule of response.body.rules) {
                expect(rule.source).to.eq('config');
                expect(rule.id).to.eq(null);
            }
        });
    });

    it('replies with the text of a rule added while running', () => {
        const text = '{"priority":"high"}';

        addRule({ match: 'E2E_ADMIN_TEXT', text }).then((response) => {
            expect(response.status).to.eq(201);
            expect(response.body.rule).to.include({
                source: 'runtime',
                match: 'E2E_ADMIN_TEXT',
                text,
            });
        });

        ask('please E2E_ADMIN_TEXT').then((response) => {
            expect(response.body.content[0].text).to.eq(text);
            expect(response.body.stop_reason).to.eq('end_turn');
        });
    });

    it('streams the text of a rule added while running', () => {
        addRule({ match: 'E2E_ADMIN_STREAM', text: 'one two three four' });

        cy.request({
            method: 'POST',
            url,
            body: body('E2E_ADMIN_STREAM', { stream: true }),
        }).then((response) => {
            const text = (response.body as string)
                .split('\n')
                .filter((line) => line.startsWith('data: '))
                .map((line) => JSON.parse(line.replace('data: ', '')))
                .filter((data) => data.type === 'content_block_delta')
                .map((data) => data.delta.text)
                .join('');

            expect(text).to.eq('one two three four');
        });
    });

    it('matches a runtime rule before a config file rule', () => {
        cy.readFile('cypress/fixtures/mock-rules/plain-reply.txt').then(
            (fixture) => {
                ask('E2E_FIXTURE_TEXT')
                    .its('body.content.0.text')
                    .should('eq', fixture);

                addRule({ match: 'E2E_FIXTURE_TEXT', text: 'overridden' });

                ask('E2E_FIXTURE_TEXT')
                    .its('body.content.0.text')
                    .should('eq', 'overridden');
            },
        );
    });

    it('ends the reply the way the rule says', () => {
        addRule({
            match: 'E2E_ADMIN_CUT',
            text: 'cut off mid',
            stopReason: 'max_tokens',
        });

        ask('E2E_ADMIN_CUT').then((response) => {
            expect(response.body.content[0].text).to.eq('cut off mid');
            expect(response.body.stop_reason).to.eq('max_tokens');
        });
    });

    it('fails the calls that match a rule with fail, and no others', () => {
        addRule({ match: 'E2E_ADMIN_FAIL', fail: { status: 429 } });

        cy.request({
            method: 'POST',
            url,
            body: body('E2E_ADMIN_FAIL'),
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(429);
            expect(response.headers['x-llmock-chaos']).to.eq('true');
            expect(response.body.error.type).to.eq('rate_limit_error');
        });

        ask('something else').its('status').should('eq', 200);
    });

    it('refuses a rule that names a file', () => {
        cy.request({
            method: 'POST',
            url: '/admin/rules',
            body: { match: 'E2E_ADMIN_FILE', file: 'package.json' },
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(400);
            expect(response.body.error).to.contain('can not use file');
        });

        cy.request('/admin/rules').its('body.rules').should('have.length', 6);
    });

    it('removes one rule by id', () => {
        addRule({ match: 'E2E_ADMIN_KEEP', text: 'kept' });
        addRule({ match: 'E2E_ADMIN_DROP', text: 'dropped' }).then(
            (response) => {
                cy.request({
                    method: 'DELETE',
                    url: `/admin/rules/${response.body.rule.id}`,
                })
                    .its('body.rules')
                    .should('have.length', 7);
            },
        );

        ask('E2E_ADMIN_KEEP').its('body.content.0.text').should('eq', 'kept');
        ask('E2E_ADMIN_DROP')
            .its('body.content.0.text')
            .should('not.eq', 'dropped');

        cy.request({
            method: 'DELETE',
            url: '/admin/rules/r0',
            failOnStatusCode: false,
        })
            .its('status')
            .should('eq', 404);
    });

    it('goes back to the config file rules after a reset', () => {
        addRule({ match: 'E2E_ADMIN_RESET', text: 'before the reset' });
        ask('E2E_ADMIN_RESET')
            .its('body.content.0.text')
            .should('eq', 'before the reset');

        reset().its('body.rules').should('have.length', 6);

        ask('E2E_ADMIN_RESET')
            .its('body.content.0.text')
            .should('not.eq', 'before the reset');
    });

    it('fails calls once chaos is switched on, and stops after a reset', () => {
        cy.request({
            method: 'PATCH',
            url: '/admin/chaos',
            body: { enabled: true, frequency: 2, status: 529 },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.chaos).to.include({
                enabled: true,
                frequency: 2,
                mode: 'every',
                status: 529,
            });
            expect(response.body.stats).to.deep.eq({ calls: 0, injected: 0 });
        });

        // Every 2nd call fails
        ask('first').its('status').should('eq', 200);
        cy.request({
            method: 'POST',
            url,
            body: body('second'),
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(529);
            expect(response.body.error.type).to.eq('overloaded_error');
        });

        cy.request('/ui-meta').its('body.chaosStatus').should('eq', 'ENABLED');

        reset().then((response) => {
            expect(response.body.chaos.enabled).to.eq(false);
            expect(response.body.stats).to.deep.eq({ calls: 0, injected: 0 });
        });

        ask('third').its('status').should('eq', 200);
        ask('fourth').its('status').should('eq', 200);
    });

    it('refuses a chaos setting that is not valid', () => {
        cy.request({
            method: 'PATCH',
            url: '/admin/chaos',
            body: { enabled: true, status: 200 },
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(400);
            expect(response.body.error).to.contain('chaos.status');
        });

        cy.request('/admin/chaos').its('body.chaos.enabled').should('eq', false);
    });

    it('waits before replying once a delay is set, and not after a reset', () => {
        cy.request({
            method: 'PATCH',
            url: '/admin/delay',
            body: { min: 600, max: 600 },
        })
            .its('body.delay')
            .should('deep.eq', { min: 600, max: 600 });

        ask('slow').its('duration').should('be.gte', 600);

        cy.request({
            method: 'PATCH',
            url: '/admin/delay',
            body: { min: 900 },
            failOnStatusCode: false,
        })
            .its('status')
            .should('eq', 400);

        reset().its('body.delay').should('deep.eq', { min: 0, max: 0 });

        ask('fast').its('duration').should('be.lt', 600);
    });

    describe('on the dashboard', () => {
        // This suite's server is started with UI_THEME=light
        it('draws the dashboard in the light theme', () => {
            cy.request('/ui-meta').its('body.uiTheme').should('eq', 'light');

            cy.visit('/');
            cy.get('html').should('have.attr', 'data-theme', 'light');
            cy.get('[cy-data="admin"]').should(
                'have.css',
                'background-color',
                'rgb(255, 255, 255)',
            );
            cy.get('h1').should('have.css', 'color', 'rgb(28, 33, 40)');
        });

        it('shows the admin API as on, with nothing added yet', () => {
            cy.visit('/');
            cy.get('[cy-data="admin_status"]').should('contain', 'ENABLED');
            cy.get('[cy-data="admin_runtime_rules"]').should('contain', '0');
            cy.get('[cy-data="rule_runtime"]').should('not.exist');
        });

        it('marks a rule added while running and shows its text', () => {
            addRule({ match: 'E2E_ADMIN_SHOWN', text: 'the reply as text' });

            cy.visit('/');
            cy.get('[cy-data="response_rules_count"]').should(
                'contain',
                '7 rules',
            );
            cy.get('[cy-data="admin_runtime_rules"]').should('contain', '1');
            cy.get('[cy-data="rule_runtime"]').should('have.length', 1);

            // The runtime rule is listed first
            cy.get('[cy-data="response_rules"] .rule')
                .first()
                .within(() => {
                    cy.contains('E2E_ADMIN_SHOWN');
                    cy.get('[cy-data="rule_runtime"]').should('be.visible');
                    cy.get('[cy-data="rule_text_link"]').click();
                });

            cy.get('[cy-data="viewer"]').should('contain', 'E2E_ADMIN_SHOWN');
            cy.get('[cy-data="viewer_text"]').should(
                'have.text',
                'the reply as text',
            );
        });

        it('still opens the file of a config rule listed after a runtime rule', () => {
            addRule({ match: 'E2E_ADMIN_FIRST', text: 'first' });

            // The first config rule: E2E_FIXTURE_JSON, replying with json-reply.json
            cy.visit('/');
            cy.get('[cy-data="rule_file_link"]').first().click();
            cy.get('[cy-data="viewer"]').should('contain', 'E2E_FIXTURE_JSON');
            cy.get('[cy-data="viewer_text"]').should(
                'contain',
                '"status": "ok"',
            );
        });

        it('undoes the runtime changes with Reset, after asking', () => {
            addRule({ match: 'E2E_ADMIN_UNDO', text: 'undone' });
            cy.request({
                method: 'PATCH',
                url: '/admin/chaos',
                body: { enabled: true, frequency: 3 },
            });

            cy.visit('/');
            cy.get('[cy-data="chaos_status"]').should('contain', 'ENABLED');
            cy.get('[cy-data="rule_runtime"]').should('have.length', 1);

            cy.get('[cy-data="admin_reset"]').click();
            cy.get('[cy-data="admin_reset_confirm"]').click();

            cy.get('[cy-data="rule_runtime"]').should('not.exist');
            cy.get('[cy-data="admin_runtime_rules"]').should('contain', '0');
            cy.get('[cy-data="chaos_status"]').should('contain', 'DISABLED');
            cy.request('/admin/rules')
                .its('body.rules')
                .should('have.length', 6);
        });
    });

    it('reports a rule added while running to the dashboard', () => {
        addRule({ match: 'E2E_ADMIN_META', text: 'shown' });

        cy.request('/ui-meta').then((response) => {
            expect(response.body.responseRules).to.have.length(7);
            expect(response.body.responseRules[0]).to.include({
                source: 'runtime',
                match: 'E2E_ADMIN_META',
                text: 'shown',
            });
        });
    });
});
