# Tool calls (Claude)

An agent built on the Anthropic Messages API runs a tool loop: it calls the model, runs the `tool_use` blocks in the reply, sends `tool_result` blocks back, and repeats until the model ends its turn. To test that loop, give a [response rule](/guide/response-rules) on a `claude` preset `content` in place of a reply text.

## A two-step loop

```json
{
  "responseRules": [
    {
      "match": "Plan a picnic in Paris",
      "in": "last",
      "content": [
        { "type": "text", "text": "Let me check the weather first." },
        { "type": "tool_use", "name": "get_weather", "input": { "city": "Paris" } }
      ]
    },
    { "match": "sunny in Paris", "in": "last", "text": "Take the picnic to the park: it will be sunny." }
  ]
}
```

The first request gets the text block and the `get_weather` call, with `stop_reason: "tool_use"`. Your loop runs the tool and sends the result back. That request's last message is the `tool_result` (`sunny in Paris, 24C`), so the second rule answers it and the turn ends with `end_turn`. With [`"in": "last"`](/guide/response-rules#matching-only-the-newest-message) the first rule does not fire again, even though the question is still in the conversation.

## Scripting a loop from a test

Rules added through the [admin API](/reference/admin-api) with `times: 1` each answer once, so a test can set up each step of a loop:

```js
const addRule = (rule) =>
  fetch('http://localhost:8001/admin/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(rule),
  });

beforeEach(() => fetch('http://localhost:8001/admin/reset', { method: 'POST' }));

test('the agent looks up the order, then the refund', async () => {
  // Step 1: the question gets a tool call
  await addRule({
    match: 'Where is my refund for order A-1001?',
    in: 'last',
    content: [{ type: 'tool_use', name: 'lookup_order', input: { order_id: 'A-1001' } }],
    times: 1,
  });
  // Step 2: the order lookup's result gets the next tool call
  await addRule({
    match: '"status":"returned"',
    in: 'last',
    content: [{ type: 'tool_use', name: 'lookup_refund', input: { order_id: 'A-1001' } }],
    times: 1,
  });
  // Step 3: the refund lookup's result ends the turn
  await addRule({ match: '"refund":"sent"', in: 'last', text: 'Your refund was sent on 2 May.', times: 1 });

  // ...run the agent; with lookup_order and lookup_refund stubbed, it
  // makes three calls to the mock and ends with the text above
});
```

## The blocks

- `content` is at most one `text` block, which must come first, then one or more `tool_use` blocks. They are returned in the order given (several `tool_use` blocks stand for parallel tool calls).
- A `tool_use` block has `name` (required), `input` (a JSON object, `{}` if left out) and an optional `id`. A block without an `id` gets a new one (`toolu_01…`) on every reply. One with an `id` keeps it on every reply.
- To keep the blocks in a file, use `contentFile` in place of `content`: `{ "match": "...", "contentFile": "fixtures/step-1.json" }`. The file holds the same JSON array. Like any fixture it is read on every request; a missing file logs a warning at startup, and a file that is not a valid array of blocks stops the server at startup (or returns a `500` if it becomes invalid while running).
- A rule has only one of `text`, `file`, `files`, `content` and `contentFile`. Tool calls are for the `claude` format only: a `content` or `contentFile` rule on any other preset stops the server at startup.

## Details

- The reply ends with `stop_reason: "tool_use"`. `stopReason` can be left out or set to `"tool_use"`. Any other value, and `"tool_use"` on a rule with no tool calls, stops the server at startup.
- Not streamed, the message's `content` is the blocks. Streamed, each block is sent in turn at its own `index`: a text block as `text_delta` events, a `tool_use` block as `content_block_start` (with its `id`, `name` and `input: {}`), then its input JSON split into a few `input_json_delta` events, then `content_block_stop`. `message_delta` carries `stop_reason: "tool_use"`. The Anthropic SDK's `stream.finalMessage()` rebuilds the same blocks.
- [`fail`](/guide/failing-a-prompt) and [chaos](/guide/chaos#stream-failures) work on these replies. `afterChunks` counts `input_json_delta` events as deltas, as well as text deltas, so a stream can be cut part-way through a tool's input.

Out of scope for now: tool calls in the OpenAI and Gemini formats, server tools (`web_search` and the like), and `/v1/messages/count_tokens`.
