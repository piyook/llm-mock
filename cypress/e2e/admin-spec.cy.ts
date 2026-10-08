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

    it('fails the first call only for a rule with fail and times 1', () => {
        addRule({ match: 'E2E_ADMIN_RETRY', fail: { status: 529 }, times: 1 })
            .its('body.rule.times')
            .should('eq', 1);

        cy.request({
            method: 'POST',
            url,
            body: body('E2E_ADMIN_RETRY'),
            failOnStatusCode: false,
        })
            .its('status')
            .should('eq', 529);

        // The rule is used up, so the retry gets a reply
        ask('E2E_ADMIN_RETRY').its('status').should('eq', 200);
        cy.request('/admin/rules').its('body.rules').should('have.length', 6);
    });

    it('gives each call the next reply when the rules have times', () => {
        addRule({ match: 'E2E_ADMIN_TURN', text: 'first', times: 1 });
        addRule({ match: 'E2E_ADMIN_TURN', text: 'second', times: 2 });

        ask('E2E_ADMIN_TURN').its('body.content.0.text').should('eq', 'first');
        ask('E2E_ADMIN_TURN').its('body.content.0.text').should('eq', 'second');

        cy.request('/admin/rules').then((response) => {
            expect(response.body.rules).to.have.length(7);
            expect(response.body.rules[0]).to.include({
                match: 'E2E_ADMIN_TURN',
                text: 'second',
                times: 1,
            });
        });
    });

    it('keeps a rule with times for the retry when chaos fails the call', () => {
        const chaos = (change: object) =>
            cy.request({ method: 'PATCH', url: '/admin/chaos', body: change });

        addRule({ match: 'E2E_ADMIN_CHAOS', text: 'after the retry', times: 1 });
        chaos({ enabled: true, frequency: 1, kind: 'http', status: 500 });

        cy.request({
            method: 'POST',
            url,
            body: body('E2E_ADMIN_CHAOS'),
            failOnStatusCode: false,
        })
            .its('status')
            .should('eq', 500);
        cy.request('/admin/rules').its('body.rules.0.times').should('eq', 1);

        chaos({ enabled: false });
        ask('E2E_ADMIN_CHAOS')
            .its('body.content.0.text')
            .should('eq', 'after the retry');
        cy.request('/admin/rules').its('body.rules').should('have.length', 6);
    });

    it('replies from the stored responses once the response type is changed', () => {
        cy.request({
            method: 'PATCH',
            url: '/admin/settings',
            body: { responseType: 'stored' },
        })
            .its('body.settings.responseType')
            .should('eq', 'stored');

        cy.request('/ui-stored-responses').then(({ body: stored }) => {
            ask('anything at all')
                .its('body.content.0.text')
                .should('be.oneOf', stored.responses);
        });

        reset().its('body.settings.responseType').should('eq', 'lorem');
        cy.request('/ui-meta').its('body.mockResponseType').should('eq', 'lorem');
    });

    it('stops checking requests once validation is switched off', () => {
        const notARequest = { hello: 'there' };
        const send = () =>
            cy.request({
                method: 'POST',
                url,
                body: notARequest,
                failOnStatusCode: false,
            });

        send().its('status').should('eq', 400);

        cy.request({
            method: 'PATCH',
            url: '/admin/settings',
            body: { validateRequests: false },
        });
        send().its('status').should('eq', 200);

        reset();
        send().its('status').should('eq', 400);
    });

    it('refuses a setting that is not valid', () => {
        cy.request({
            method: 'PATCH',
            url: '/admin/settings',
            body: { responseType: 'markov' },
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.eq(400);
            expect(response.body.error).to.contain('settings.responseType');
        });
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
            // The page names its theme however it is asked for
            for (const page of ['/', '/index.html']) {
                cy.request(page)
                    .its('body')
                    .should('contain', '<html data-theme="light"');
            }

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

        it('switches the response type from the dashboard, and back with Reset', () => {
            cy.visit('/');
            cy.get('[cy-data="response_type"]').should('have.text', 'lorem');

            cy.get('[cy-data="switch_response_type"]')
                .should('contain', 'Use stored')
                .click();
            cy.get('[cy-data="response_type"]').should('have.text', 'stored');
            cy.get('[cy-data="switch_response_type"]').should('contain', 'Use lorem');
            cy.get('[cy-data="stored_responses_link"]').should('be.visible');
            cy.request('/admin/settings')
                .its('body.settings.responseType')
                .should('eq', 'stored');

            cy.get('[cy-data="admin_reset"]').click();
            cy.get('[cy-data="admin_reset_confirm"]').click();
            cy.get('[cy-data="response_type"]').should('have.text', 'lorem');
        });

        it('switches chaos, validation and the request log from the dashboard', () => {
            cy.visit('/');

            cy.get('[cy-data="chaos_status"]').should('have.text', 'DISABLED');
            cy.get('[cy-data="switch_chaos"]').should('contain', 'Turn on').click();
            cy.get('[cy-data="chaos_status"]').should('have.text', 'ENABLED');
            cy.get('[cy-data="switch_chaos"]').should('contain', 'Turn off').click();
            cy.get('[cy-data="chaos_status"]').should('have.text', 'DISABLED');

            cy.get('[cy-data="validate_requests"]').should('have.text', 'ON');
            cy.get('[cy-data="switch_validate_requests"]').click();
            cy.get('[cy-data="validate_requests"]').should('have.text', 'OFF');

            cy.get('[cy-data="log_requests"]').then(($badge) => {
                const before = $badge.text();
                cy.get('[cy-data="switch_log_requests"]').click();
                cy.get('[cy-data="log_requests"]').should(
                    'have.text',
                    before === 'ON' ? 'OFF' : 'ON',
                );
            });

            // This template streams when a request asks, so there is no switch
            cy.get('[cy-data="switch_streaming"]').should('not.exist');
        });

        const fill = (box: string, value: number) =>
            cy.get(`[cy-data="${box}"]`).clear().type(String(value));

        it('changes the response delay from the dashboard', () => {
            cy.visit('/');
            cy.get('[cy-data="response_delay"]').should('have.text', 'Off');

            cy.get('[cy-data="change_delay"]').click();
            cy.get('[cy-data="edit_delay_min"]').should('have.value', '0');
            fill('edit_delay_min', 10);
            fill('edit_delay_max', 20);
            cy.get('[cy-data="save_delay"]').click();

            cy.get('[cy-data="response_delay"]').should('have.text', '10–20ms');
            cy.request('/admin/delay')
                .its('body.delay')
                .should('deep.eq', { min: 10, max: 20 });
        });

        it('keeps the boxes open and says why when a change is refused', () => {
            cy.visit('/');
            cy.get('[cy-data="change_delay"]').click();
            fill('edit_delay_min', 50);
            fill('edit_delay_max', 10);
            cy.get('[cy-data="save_delay"]').click();

            cy.get('[cy-data="change_error"]').should(
                'contain',
                'can not be more than',
            );
            cy.get('[cy-data="edit_delay_max"]').should('be.visible');

            fill('edit_delay_max', 60);
            cy.get('[cy-data="save_delay"]').click();
            cy.get('[cy-data="change_error"]').should('not.exist');
            cy.get('[cy-data="response_delay"]').should('have.text', '50–60ms');
        });

        it('changes the lorem length and the log size from the dashboard', () => {
            cy.visit('/');

            cy.get('[cy-data="change_max_lorem"]').click();
            fill('edit_max_lorem_maxLoremParas', 2);
            cy.get('[cy-data="save_max_lorem"]').click();
            cy.get('[cy-data="max_lorem"]').should('have.text', '2');

            cy.get('[cy-data="change_max_logged_requests"]').click();
            fill('edit_max_logged_requests_maxLoggedRequests', 25);
            cy.get('[cy-data="save_max_logged_requests"]').click();
            cy.get('[cy-data="max_logged_requests"]').should('have.text', '25');

            cy.request('/admin/settings')
                .its('body.settings')
                .should('include', { maxLoremParas: 2, maxLoggedRequests: 25 });
        });

        it('changes how chaos fails calls from the dashboard', () => {
            cy.visit('/');
            cy.get('[cy-data="switch_chaos"]').click();

            cy.get('[cy-data="change_chaos_frequency"]').click();
            fill('edit_chaos_frequency_frequency', 3);
            cy.get('[cy-data="edit_chaos_frequency_mode"]').select('random');
            cy.get('[cy-data="save_chaos_frequency"]').click();
            cy.get('[cy-data="chaos_frequency"]').should(
                'have.text',
                'Random, 1 in 3',
            );

            cy.get('[cy-data="change_chaos_status"]').click();
            fill('edit_chaos_status_status', 503);
            cy.get('[cy-data="save_chaos_status"]').click();
            cy.get('[cy-data="chaos_error_status"]').should('have.text', '503');

            cy.get('[cy-data="change_chaos_kind"]').click();
            cy.get('[cy-data="edit_chaos_kind_kind"]').select('stream-drop');
            cy.get('[cy-data="save_chaos_kind"]').click();
            cy.get('[cy-data="chaos_kind"]').should('have.text', 'stream-drop');

            cy.get('[cy-data="change_chaos_after_chunks"]').click();
            fill('edit_chaos_after_chunks_afterChunks', 0);
            cy.get('[cy-data="save_chaos_after_chunks"]').click();
            cy.get('[cy-data="chaos_after_chunks"]').should(
                'have.text',
                'Straight away',
            );

            cy.request('/admin/chaos').its('body.chaos').should('deep.eq', {
                enabled: true,
                frequency: 3,
                mode: 'random',
                status: 503,
                kind: 'stream-drop',
                afterChunks: 0,
            });
        });

        it('leaves a setting alone when a change is cancelled', () => {
            cy.visit('/');
            cy.get('[cy-data="change_delay"]').click();
            fill('edit_delay_max', 900);
            cy.contains('[cy-data="responses"] button', 'Cancel').click();

            cy.get('[cy-data="response_delay"]').should('have.text', 'Off');
            cy.request('/admin/delay')
                .its('body.delay')
                .should('deep.eq', { min: 0, max: 0 });
        });

        it('shows how many requests a rule with times has left', () => {
            addRule({ match: 'E2E_ADMIN_LEFT', text: 'twice', times: 2 });
            addRule({ match: 'E2E_ADMIN_STAYS', text: 'always' });

            cy.visit('/');
            cy.get('[cy-data="rule_times"]')
                .should('have.length', 1)
                .and('contain', '2 left');

            // The dashboard asks again every 2 seconds
            ask('E2E_ADMIN_LEFT');
            cy.get('[cy-data="rule_times"]').should('contain', '1 left');

            ask('E2E_ADMIN_LEFT');
            cy.get('[cy-data="rule_times"]').should('not.exist');
            cy.get('[cy-data="admin_runtime_rules"]').should('have.text', '1');
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
