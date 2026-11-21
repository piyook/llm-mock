# Response rules (fixture replies)

Lorem text is fine for UI work, but some callers expect a specific shape, such as JSON that gets parsed. Add `responseRules` to a preset to return the contents of a file whenever the request contains a given string:

```json
{
  "models": {
    "chatgpt": {
      "responseRules": [
        { "match": "Classify this support ticket", "file": "fixtures/triage.json" },
        { "match": "Summarise the thread", "file": "fixtures/summary.txt" }
      ]
    }
  }
}
```

With a request whose message contains `Classify this support ticket`, the server replies with `fixtures/triage.json` as the message text, so the client can `JSON.parse` it. Anything that matches no rule gets the normal response for the preset's `responseType`.

- `match` is a case-sensitive substring, tested against every string value in the request body (message text, system prompt, content blocks), not against JSON keys.
- Rules are checked in order and the first match wins. `match` and `file` must be non-empty strings.
- GET requests have no body, so rules never apply to them.
- Matching covers the whole request, including earlier turns of a conversation (and, for Claude, the `tools` list). A rule that matched an early message keeps matching on every later turn, so use distinctive markers and put more specific rules first. To match only the newest message, give the rule `"in": "last"`: its `match` is then looked for in the content of the last entry of `messages` only (including any `tool_result` content; for Gemini, the parts of the last entry of `contents`), not in earlier turns, the system prompt or the tools. Ids copied from an earlier reply (a `tool_result`'s `tool_use_id`, `tool_call_id`, `call_id`, `id`) are not looked in either. `"in": "any"` is the default.
- A rule matches text that *contains* its `match`. Add `"exact": true` to match only when the text looked in is `match` and nothing more: with `"in": "last"`, a rule for `Hi` then answers `Hi` but not `Hi there`. The last message's strings are joined with a newline, so a Claude `tool_result` of `21C` reads `tool_result` + newline + `21C`.
- `file` is resolved relative to the folder holding the config file, and is read exactly as written (including any trailing newline). It is read on every request, so you can edit it without restarting.
- For varied replies to the same kind of request, give a rule `files` instead of `file`: `{ "match": "Summarise the thread", "files": ["fixtures/summary-a.txt", "fixtures/summary-b.txt"] }`. One of the files is picked at random on each matching request. A rule has either `file` or `files`, not both, and `files` must be a non-empty list of non-empty strings.
- For a short reply, a rule can hold the reply itself as `text` in place of a file: `{ "match": "Classify this support ticket", "text": "{\"priority\":\"high\"}" }`. A rule has only one of `text`, `file` and `files`.
- To add a rule while the server is running, use the [admin API](/reference/admin-api#admin-api-changing-rules-and-settings-while-running).
- A malformed rule stops the server at startup. An unreadable fixture (including any entry of `files`) logs a warning at startup, and a request that needs it returns an error rather than falling back to generated text.
- Works with every preset and with both static and streamed replies.

## Truncated and refused replies (`stopReason`)

A real model does not always finish its answer: it can run out of tokens, or decline. To test how your app handles that, give a rule a `stopReason`:

```json
{
  "responseRules": [
    { "match": "Summarise this", "file": "fixtures/cut-off.txt", "stopReason": "max_tokens" },
    { "match": "Write the exploit", "file": "fixtures/refused.txt", "stopReason": "refusal" }
  ]
}
```

| `stopReason` | `claude` | `openai` (and custom templates) | `gemini` |
|---|---|---|---|
| `end` (the default) | `stop_reason: "end_turn"` | `finish_reason: "stop"` | `finishReason: "STOP"` |
| `max_tokens` | `stop_reason: "max_tokens"` | `finish_reason: "length"` | `finishReason: "MAX_TOKENS"` |
| `refusal` | `stop_reason: "refusal"` | `finish_reason: "content_filter"` | `finishReason: "SAFETY"` |

- The reply text is still the fixture, exactly as written. LLMock does not shorten it, so write a fixture that stops part-way through a sentence (or part-way through a JSON object, to test your parser).
- It works with `file` and `files`, and with static and streamed replies. In a `claude` stream the value is in the `message_delta` event; in an OpenAI-style stream it is the last chunk's `finish_reason`. A streamed `gemini` reply is OpenAI-style, so it carries the `openai` value.
- A refused `claude` reply also carries the `stop_details` object the Anthropic API sends with a refusal: `{ "type": "refusal", "category": null, "explanation": null }`.
- A rule without `stopReason` behaves exactly as before. Any other value stops the server at startup.

## Failing one prompt (`fail`)

[Chaos mode](/guide/delay-and-chaos#chaos-mode-error-simulation) fails 1 in X calls, whichever they are. To fail one particular prompt and leave the rest alone, give a rule `fail`:

```json
{
  "responseRules": [
    { "match": "Summarise the Q3 report", "fail": { "kind": "stream-error", "status": 529, "afterChunks": 1 } },
    { "match": "Translate this", "fail": { "status": 429 } }
  ]
}
```

| `fail` setting | What it does | Default |
|---|---|---|
| `kind` | `"http"`, `"stream-error"`, `"stream-drop"` or `"stream-stall"`, as in [Stream failures](/guide/delay-and-chaos#stream-failures) | `"http"` |
| `status` | HTTP status of the error, `400` to `599` | `500` |
| `afterChunks` | How many content deltas a failing stream sends first | `2` |

- Every call that matches the rule fails, whether or not chaos is on. Every other call is untouched, so your tests do not depend on the order the calls arrive in.
- The call gets exactly what a failing chaos call of that `kind` gets: the same error bodies, the `x-llmock-chaos: true` header, and the same handling of a call that did not ask for a stream.
- All three settings are optional: `"fail": {}` is an HTTP 500. They are the rule's own; nothing is taken from the preset's `chaos`.
- A rule with `fail` needs no `file` or `files`. Add one to choose the text a `stream-*` failure sends before it fails; without one that text is a normal generated reply.
- The rule fails every time, so a client that retries the same prompt fails again. To have a retry succeed, use chaos with `frequency: 2`.
- These failures are added to the dashboard's chaos count, but do not shift which of the other calls chaos fails.
- A `fail` that is not valid stops the server at startup.

## Tool calls (Claude, `content`)

An agent built on the Anthropic Messages API runs a tool loop: it calls the model, runs the `tool_use` blocks in the reply, sends `tool_result` blocks back, and repeats until the model ends its turn. To test that loop, give a rule on a `claude` preset `content` in place of a reply text:

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

The first request gets the text block and the `get_weather` call, with `stop_reason: "tool_use"`. Your loop runs the tool and sends the result back. That request's last message is the `tool_result` (`sunny in Paris, 24C`), so the second rule answers it and the turn ends with `end_turn`. With `"in": "last"` the first rule does not fire again, even though the question is still in the conversation.

- `content` is at most one `text` block, which must come first, then one or more `tool_use` blocks. They are returned in the order given (several `tool_use` blocks stand for parallel tool calls).
- A `tool_use` block has `name` (required), `input` (a JSON object, `{}` if left out) and an optional `id`. A block without an `id` gets a new one (`toolu_01…`) on every reply. One with an `id` keeps it on every reply.
- The reply ends with `stop_reason: "tool_use"`. `stopReason` can be left out or set to `"tool_use"`. Any other value, and `"tool_use"` on a rule with no tool calls, stops the server at startup.
- To keep the blocks in a file, use `contentFile` in place of `content`: `{ "match": "...", "contentFile": "fixtures/step-1.json" }`. The file holds the same JSON array. Like any fixture it is read on every request; a missing file logs a warning at startup, and a file that is not a valid array of blocks stops the server at startup (or returns a `500` if it becomes invalid while running).
- A rule has only one of `text`, `file`, `files`, `content` and `contentFile`. Tool calls are for the `claude` format only: a `content` or `contentFile` rule on any other preset stops the server at startup.
- Not streamed, the message's `content` is the blocks. Streamed, each block is sent in turn at its own `index`: a text block as `text_delta` events, a `tool_use` block as `content_block_start` (with its `id`, `name` and `input: {}`), then its input JSON split into a few `input_json_delta` events, then `content_block_stop`. `message_delta` carries `stop_reason: "tool_use"`. The Anthropic SDK's `stream.finalMessage()` rebuilds the same blocks.
- [`fail`](#failing-one-prompt-fail) and [chaos](/guide/delay-and-chaos#stream-failures) work on these replies. `afterChunks` counts `input_json_delta` events as deltas, as well as text deltas, so a stream can be cut part-way through a tool's input.
- To set a tool-call reply from a test, send the rule with `content` to the [admin API](/reference/admin-api#admin-api-changing-rules-and-settings-while-running).

Scripting each step of a loop from inside a test, with rules that each answer once:

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

Out of scope for now: tool calls in the OpenAI and Gemini formats, server tools (`web_search` and the like), and `/v1/messages/count_tokens`.
