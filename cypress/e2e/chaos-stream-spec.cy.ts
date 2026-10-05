// Runs against the `chaos-stream` preset of .llmockrc.test.json: claude format
// with chaos on, failing every 2nd call. The kind is `stream-error` with
// `afterChunks: 1`, so a failing streamed call starts, sends one delta, then
// gets the in-stream error. The tests share the server's call counter, so
// each one sends an even number of calls and leaves the next call as one
// that succeeds.
describe('Mock LLM Spec for chaos stream failures', () => {
    const url = '/v1/messages';

    const post = (extra = {}) =>
        cy.request({
            method: 'POST',
            url,
            failOnStatusCode: false,
            body: {
                model: 'claude-opus-5-5',
                max_tokens: 256,
                messages: [{ role: 'user', content: 'E2E_FIXTURE_TEXT' }],
                ...extra,
            },
        });

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

    it('reports the kind and afterChunks to the dashboard', () => {
        cy.request('/ui-meta').its('body').should('include', {
            chaosStatus: 'ENABLED',
            chaosFrequency: 2,
            chaosErrorStatus: 529,
            chaosKind: 'stream-error',
            chaosAfterChunks: 1,
        });
    });

    it('fails every 2nd streamed call part-way through the stream', () => {
        post({ stream: true }).then((response) => {
            const events = parseSse(response.body as string);

            expect(response.status).to.eq(200);
            expect(response.headers).not.to.have.property('x-llmock-chaos');
            expect(events.at(-1)?.event).to.eq('message_stop');
        });

        post({ stream: true }).then((response) => {
            const events = parseSse(response.body as string);

            // The headers went out before the failure
            expect(response.status).to.eq(200);
            expect(response.headers['content-type']).to.contain(
                'text/event-stream',
            );
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
    });

    it('answers a failing call that did not ask for a stream with the HTTP error', () => {
        post().its('status').should('eq', 200);

        post().then((response) => {
            expect(response.status).to.eq(529);
            expect(response.headers['content-type']).to.contain(
                'application/json',
            );
            expect(response.headers['x-llmock-chaos']).to.eq('true');
            expect(response.headers['retry-after']).to.eq('1');
            expect(response.body.error.type).to.eq('overloaded_error');
        });
    });

    it('shows the kind and a rising failure count on the dashboard', () => {
        cy.request('/ui-meta')
            .its('body.chaosInjected')
            .then((injected: number) => {
                cy.visit('/');
                cy.get('[cy-data="chaos_kind"]').should(
                    'have.text',
                    'stream-error',
                );
                cy.get('[cy-data="chaos_after_chunks"]').should(
                    'have.text',
                    'After 1 delta',
                );
                cy.get('[cy-data="chaos_injected"]').should(
                    'have.text',
                    String(injected),
                );

                post({ stream: true }).its('status').should('eq', 200);
                post({ stream: true })
                    .its('headers.x-llmock-chaos')
                    .should('eq', 'true');

                // A stream failure is counted; the dashboard polls every 2 seconds
                cy.get('[cy-data="chaos_injected"]').should(
                    'have.text',
                    String(injected + 1),
                );
            });
    });
});
