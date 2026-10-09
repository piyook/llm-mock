describe('Mock LLM Spec for Claude (Anthropic Messages API)', () => {
    const url = '/v1/messages';

    const baseBody = {
        model: 'claude-opus-5-5',
        max_tokens: 256,
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
    };

    // Parses an SSE body into [{ event, data }] entries.
    const parseSse = (body: string) =>
        body
            .split('\n\n')
            .filter((block) => block.trim().length > 0)
            .map((block) => {
                const [eventLine, dataLine] = block.split('\n');
                return {
                    event: eventLine.replace('event: ', ''),
                    data: JSON.parse(dataLine.replace('data: ', '')),
                };
            });

    it('should be up and running', () => {
        cy.request('/ping').its('status').should('eq', 200);
    });

    describe('static response (stream not requested)', () => {
        it('returns an Anthropic message', () => {
            cy.request({ method: 'POST', url, body: baseBody }).then(
                (response) => {
                    expect(response.status).to.eq(200);
                    expect(response.body).to.have.property('type', 'message');
                    expect(response.body).to.have.property('role', 'assistant');
                    expect(response.body).to.have.property(
                        'stop_reason',
                        'end_turn',
                    );
                    expect(response.body.content).to.be.an('array');
                    expect(response.body.content[0]).to.have.property(
                        'type',
                        'text',
                    );
                    expect(response.body.content[0].text).to.be.a('string');
                    expect(
                        response.body.content[0].text.length,
                    ).to.be.greaterThan(0);
                },
            );
        });

        it('gives each response a unique id and reports usage', () => {
            const send = () =>
                cy.request({ method: 'POST', url, body: baseBody });

            send().then((first) => {
                send().then((second) => {
                    expect(first.body.id).to.match(/^msg_[A-Za-z0-9]{24}$/);
                    expect(second.body.id).to.not.eq(first.body.id);
                    expect(first.body.usage.input_tokens).to.be.greaterThan(0);
                    expect(first.body.usage.output_tokens).to.be.greaterThan(0);
                    expect(first.body).to.not.have.property('created_at');
                });
            });
        });

        it('echoes the requested model', () => {
            cy.request({
                method: 'POST',
                url,
                body: { ...baseBody, model: 'claude-test-model' },
            }).then((response) => {
                expect(response.body.model).to.eq('claude-test-model');
            });
        });

        it('returns a static message when stream is false', () => {
            cy.request({
                method: 'POST',
                url,
                body: { ...baseBody, stream: false },
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.have.property('type', 'message');
            });
        });
    });

    describe('streaming response (stream: true)', () => {
        it('returns a Server-Sent Events stream', () => {
            cy.request({
                method: 'POST',
                url,
                body: { ...baseBody, stream: true },
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.headers['content-type']).to.contain(
                    'text/event-stream',
                );
            });
        });

        it('emits the Anthropic event sequence', () => {
            cy.request({
                method: 'POST',
                url,
                body: { ...baseBody, stream: true },
            }).then((response) => {
                const events = parseSse(response.body as string);
                const names = events.map((e) => e.event);

                expect(names[0]).to.eq('message_start');
                expect(names[1]).to.eq('content_block_start');
                expect(names.slice(-3)).to.deep.eq([
                    'content_block_stop',
                    'message_delta',
                    'message_stop',
                ]);
                names
                    .slice(2, -3)
                    .forEach((name) =>
                        expect(name).to.eq('content_block_delta'),
                    );
                events.forEach((e) => expect(e.data.type).to.eq(e.event));

                const text = events
                    .filter((e) => e.event === 'content_block_delta')
                    .map((e) => e.data.delta.text)
                    .join('');
                expect(text.length).to.be.greaterThan(0);
                expect(events.at(-2)?.data.delta.stop_reason).to.eq(
                    'end_turn',
                );
            });
        });

        it('echoes the requested model in message_start', () => {
            cy.request({
                method: 'POST',
                url,
                body: { ...baseBody, model: 'claude-test-model', stream: true },
            }).then((response) => {
                const [start] = parseSse(response.body as string);
                expect(start.data.message.model).to.eq('claude-test-model');
            });
        });
    });

    describe('response rules (fixture replies)', () => {
        const fixturePath = 'cypress/fixtures/mock-rules/plain-reply.txt';
        const ruleBody = (marker: string, extra = {}) => ({
            ...baseBody,
            messages: [{ role: 'user', content: `please answer ${marker}` }],
            ...extra,
        });

        it('returns the fixture text exactly on the static path', () => {
            cy.readFile(fixturePath).then((expected) => {
                cy.request({
                    method: 'POST',
                    url,
                    body: ruleBody('E2E_FIXTURE_TEXT'),
                }).then((response) => {
                    expect(response.body.content[0].text).to.eq(expected);
                    expect(response.body.type).to.eq('message');
                });
            });
        });

        it('streams the fixture text so the deltas rejoin exactly', () => {
            cy.readFile(fixturePath).then((expected) => {
                cy.request({
                    method: 'POST',
                    url,
                    body: ruleBody('E2E_FIXTURE_TEXT', { stream: true }),
                }).then((response) => {
                    const text = parseSse(response.body as string)
                        .filter((e) => e.event === 'content_block_delta')
                        .map((e) => e.data.delta.text)
                        .join('');
                    expect(text).to.eq(expected);
                });
            });
        });

        it('returns a JSON fixture that parses back to the file', () => {
            cy.readFile('cypress/fixtures/mock-rules/json-reply.json').then(
                (expected) => {
                    cy.request({
                        method: 'POST',
                        url,
                        body: ruleBody('E2E_FIXTURE_JSON'),
                    }).then((response) => {
                        const parsed = JSON.parse(
                            response.body.content[0].text,
                        );
                        expect(parsed).to.deep.eq(expected);
                    });
                },
            );
        });

        it('matches a marker in the system prompt', () => {
            cy.readFile(fixturePath).then((expected) => {
                cy.request({
                    method: 'POST',
                    url,
                    body: {
                        ...baseBody,
                        system: [{ type: 'text', text: 'E2E_FIXTURE_TEXT' }],
                    },
                }).then((response) => {
                    expect(response.body.content[0].text).to.eq(expected);
                });
            });
        });

        it('returns one of the pooled files for a rule with files', () => {
            const pool = ['Pool reply A.', 'Pool reply B.'];

            Cypress._.times(6, () => {
                cy.request({
                    method: 'POST',
                    url,
                    body: ruleBody('E2E_FIXTURE_POOL'),
                }).then((response) => {
                    expect(pool).to.include(response.body.content[0].text);
                });
            });

            cy.request({
                method: 'POST',
                url,
                body: ruleBody('E2E_FIXTURE_POOL', { stream: true }),
            }).then((response) => {
                const text = parseSse(response.body as string)
                    .filter((e) => e.event === 'content_block_delta')
                    .map((e) => e.data.delta.text)
                    .join('');
                expect(pool).to.include(text);
            });
        });

        it('ends a reply the way its rule says, not streamed', () => {
            cy.request({
                method: 'POST',
                url,
                body: ruleBody('E2E_FIXTURE_CUT_OFF'),
            }).then((response) => {
                expect(response.body.stop_reason).to.eq('max_tokens');
                expect(response.body).not.to.have.property('stop_details');
                expect(response.body.content[0].text).to.match(/except$/);
            });

            cy.request({
                method: 'POST',
                url,
                body: ruleBody('E2E_FIXTURE_REFUSED'),
            }).then((response) => {
                expect(response.body.stop_reason).to.eq('refusal');
                expect(response.body.stop_details).to.deep.eq({
                    type: 'refusal',
                    category: null,
                    explanation: null,
                });
            });

            // A rule with no stopReason ends normally
            cy.request({
                method: 'POST',
                url,
                body: ruleBody('E2E_FIXTURE_TEXT'),
            }).then((response) => {
                expect(response.body.stop_reason).to.eq('end_turn');
                expect(response.body).not.to.have.property('stop_details');
            });
        });

        it('ends a streamed reply the way its rule says', () => {
            const messageDelta = (marker: string) =>
                cy
                    .request({
                        method: 'POST',
                        url,
                        body: ruleBody(marker, { stream: true }),
                    })
                    .then((response) => {
                        const events = parseSse(response.body as string);
                        expect(events.at(-1)?.event).to.eq('message_stop');
                        return events.find((e) => e.event === 'message_delta')
                            ?.data.delta;
                    });

            messageDelta('E2E_FIXTURE_CUT_OFF').should('deep.eq', {
                stop_reason: 'max_tokens',
                stop_sequence: null,
            });
            messageDelta('E2E_FIXTURE_REFUSED').should('deep.eq', {
                stop_reason: 'refusal',
                stop_sequence: null,
                stop_details: {
                    type: 'refusal',
                    category: null,
                    explanation: null,
                },
            });
            messageDelta('E2E_FIXTURE_TEXT').should('deep.eq', {
                stop_reason: 'end_turn',
                stop_sequence: null,
            });
        });

        it('reports each rule\'s stop reason and shows it on the dashboard', () => {
            cy.request('/ui-meta')
                .its('body.responseRules')
                .then((rules: Array<{ match: string; stopReason: string }>) => {
                    expect(
                        rules.map((rule) => [rule.match, rule.stopReason]),
                    ).to.deep.eq([
                        ['E2E_FIXTURE_JSON', 'end'],
                        ['E2E_FIXTURE_TEXT', 'end'],
                        ['E2E_FIXTURE_POOL', 'end'],
                        ['E2E_FIXTURE_CUT_OFF', 'max_tokens'],
                        ['E2E_FIXTURE_REFUSED', 'refusal'],
                        ['E2E_FIXTURE_FAIL', 'end'],
                    ]);
                });

            cy.visit('/#/rules');
            cy.get('[cy-data="response_rules_count"]').should(
                'contain',
                '6 rules',
            );
            // Only a rule that does not end normally says how it ends
            cy.get('[cy-data="rule_stop_reason"]').should('have.length', 2);
            cy.get('[cy-data="rule_stop_reason"]')
                .eq(0)
                .should('have.text', 'max_tokens');
            cy.get('[cy-data="rule_stop_reason"]')
                .eq(1)
                .should('have.text', 'refusal');
        });

        it('fails only the calls that match a rule with fail', () => {
            // Chaos is off in this preset: the rule fails its calls anyway
            cy.request({
                method: 'POST',
                url,
                body: ruleBody('E2E_FIXTURE_FAIL', { stream: true }),
            }).then((response) => {
                const events = parseSse(response.body as string);

                expect(response.status).to.eq(200);
                expect(response.headers['x-llmock-chaos']).to.eq('true');
                expect(events.map((e) => e.event)).to.deep.eq([
                    'message_start',
                    'content_block_start',
                    'content_block_delta',
                    'error',
                ]);
                expect(events.at(-1)?.data).to.deep.eq({
                    type: 'error',
                    error: {
                        type: 'overloaded_error',
                        message: 'llmock chaos: simulated 529 error',
                    },
                });
            });

            // Not streamed, a stream-error is the HTTP error
            cy.request({
                method: 'POST',
                url,
                failOnStatusCode: false,
                body: ruleBody('E2E_FIXTURE_FAIL'),
            }).then((response) => {
                expect(response.status).to.eq(529);
                expect(response.headers['x-llmock-chaos']).to.eq('true');
                expect(response.body.error.type).to.eq('overloaded_error');
            });

            // The next call, which matches another rule, is untouched
            cy.request({
                method: 'POST',
                url,
                body: ruleBody('E2E_FIXTURE_TEXT'),
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.headers).not.to.have.property('x-llmock-chaos');
            });
        });

        it('reports how a rule fails and shows it on the dashboard', () => {
            cy.request('/ui-meta')
                .its('body.responseRules')
                .then((rules: Array<{ match: string; fail: unknown }>) => {
                    expect(rules.at(-1)).to.deep.include({
                        match: 'E2E_FIXTURE_FAIL',
                        files: [],
                        fail: {
                            kind: 'stream-error',
                            status: 529,
                            afterChunks: 1,
                        },
                    });
                    expect(rules[0].fail).to.eq(null);
                });

            cy.visit('/#/rules');
            // Only the rule that fails says so, and it has no file to open
            cy.get('[cy-data="rule_fail"]')
                .should('have.length', 1)
                .and('have.text', 'stream-error 529 after 1 delta');
            cy.get('[cy-data="rule_fail"]')
                .closest('.rule')
                .find('[cy-data="rule_file_link"]')
                .should('not.exist');
        });

        it('generates normal text when no rule matches', () => {
            cy.readFile(fixturePath).then((fixture) => {
                cy.request({
                    method: 'POST',
                    url,
                    body: ruleBody('nothing special'),
                }).then((response) => {
                    const text = response.body.content[0].text;
                    expect(text).to.not.eq(fixture);
                    expect(text.length).to.be.greaterThan(0);
                });
            });
        });
    });

    describe('request validation', () => {
        it('accepts a body shaped like the Anthropic SDK sends', () => {
            cy.request({
                method: 'POST',
                url,
                body: {
                    ...baseBody,
                    system: [{ type: 'text', text: 'You are helpful.' }],
                    output_config: { effort: 'medium' },
                    stream: true,
                },
            })
                .its('status')
                .should('eq', 200);
        });

        it('rejects a request without messages', () => {
            cy.request({
                method: 'POST',
                url,
                body: { model: 'claude-opus-5-5', max_tokens: 256 },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(400);
                expect(response.body).to.contain('Invalid or Missing Request');
            });
        });
    });
});
