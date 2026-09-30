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
