# Delays and chaos mode

## Response delay simulation

Simulate realistic API latency to test loading states, timeout handling, and UX:

```json
{
  "responseDelay": { "min": 800, "max": 2500 }
}
```

Set both values to `0` for instant responses. The server picks a random value in the range for each request.

| Profile | min | max |
|---|---|---|
| Instant (development) | 0 | 0 |
| Fast | 100 | 300 |
| Realistic production | 800 | 2500 |
| Slow / timeout testing | 3000 | 8000 |
| Fixed delay | 1000 | 1000 |

## Chaos mode (error simulation)

Turn on chaos to have some calls fail, so you can test retries, backoff and error handling. By default a failing call is answered with an HTTP error in place of a reply:

```json
{
  "chaos": { "enabled": true, "frequency": 3, "mode": "every", "status": 429 }
}
```

```bash
llmock start --chaos=true --chaosFrequency=3 --chaosStatus=429
```

| Setting | CLI flag | Meaning | Default |
|---|---|---|---|
| `enabled` | `--chaos` | Chaos on or off | `false` |
| `frequency` | `--chaosFrequency` | Fail 1 in this many calls. `1` fails every call | `1` |
| `mode` | `--chaosMode` | `"every"` fails calls X, 2X, 3X and so on, which is repeatable. `"random"` gives each call a 1 in X chance of failing | `"every"` |
| `status` | `--chaosStatus` | HTTP status of the error, `400` to `599` | `500` |
| `kind` | `--chaosKind` | What a failing call gets: `"http"`, `"stream-error"`, `"stream-drop"` or `"stream-stall"` (see [Stream failures](#stream-failures)) | `"http"` |
| `afterChunks` | `--chaosAfterChunks` | How many content deltas a failing stream sends before it fails | `2` |

- Chaos applies to the chat endpoint and `/v1/embeddings`, which share one call count. The dashboard, `/ping` and the `/ui-*` routes never fail.
- Only a call that would have succeeded is counted. An invalid request still gets its `400`.
- The response delay runs first, then the error is sent. A streamed call that fails gets the same JSON error, with no stream (unless `kind` says otherwise, see [Stream failures](#stream-failures)).
- The error body has the shape the preset's provider uses, so your client's own error parsing runs:

  | Preset `name` | Error body |
  |---|---|
  | `openai` (and custom templates) | `{ "error": { "message", "type", "param", "code" } }` |
  | `claude` | `{ "type": "error", "error": { "type", "message" } }` with `rate_limit_error` (429), `overloaded_error` (529) or `api_error` |
  | `gemini` | `{ "error": { "code", "message", "status" } }` with `RESOURCE_EXHAUSTED` (429), `UNAVAILABLE` (503) or `INTERNAL` |

  `/v1/embeddings` always uses the `openai` shape.
- A `429`, `503` or `529` carries `retry-after: 1`. Every chaos error carries `x-llmock-chaos: true`, so a test can tell it from a real failure.
- A `frequency`, `mode`, `status`, `kind` or `afterChunks` in the config file that is not valid stops the server at startup.
- The **Chaos** box on the dashboard's **Settings** page shows the settings and how many calls have been failed since the server started.

### Stream failures

An HTTP error is the easy failure to handle. The one that catches streaming apps out is a reply that starts and then dies. Set `kind` to have a failing call do that:

```json
{
  "chaos": { "enabled": true, "frequency": 2, "kind": "stream-error", "afterChunks": 2 }
}
```

```bash
llmock start --model=claude --chaos=true --chaosFrequency=2 --chaosKind=stream-error
```

| `kind` | What a failing streamed call gets |
|---|---|
| `http` | The HTTP error described above, with no stream. This is the default |
| `stream-error` | The stream starts, sends `afterChunks` content deltas, then sends the provider's in-stream error and ends |
| `stream-drop` | The stream starts, sends `afterChunks` content deltas, then the connection is cut with nothing more sent |
| `stream-stall` | The stream starts, sends `afterChunks` content deltas, then goes silent. The connection stays open until your client gives up |

With the settings above, every 2nd streamed call to the `claude` preset looks like this:

```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Lorem ipsum "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"dolor sit "}}

event: error
data: {"type":"error","error":{"type":"api_error","message":"llmock chaos: simulated 500 error"}}
```

- `frequency` and `mode` still decide which calls fail, and the dashboard's count includes these failures.
- The stream has status `200`, because its headers have gone before it fails, and carries `x-llmock-chaos: true`. None of the closing events are sent: no `message_stop` for `claude`, no `data: [DONE]` for an OpenAI-style stream.
- `afterChunks` counts content deltas: text deltas, and the `input_json_delta` events of a Claude [tool-call reply](/guide/response-rules#tool-calls-claude-content), across all its blocks. `0` fails straight after the opening events. If the reply has fewer deltas than `afterChunks`, the stream fails after the last one. A reply is split into about 5 deltas.
- For `claude` the in-stream error is an `event: error` whose error `type` follows `status` (`rate_limit_error` for 429, `overloaded_error` for 529, otherwise `api_error`). An OpenAI-style stream (`openai`, `gemini` and custom templates) gets a `data:` line holding the `openai` error body.
- A failing call that did not ask for a stream has no stream to cut. With `stream-error` it gets the HTTP error. With `stream-drop` the connection is cut without an answer, and with `stream-stall` it is held open without one. This includes `/v1/embeddings`.
- `stream-stall` never times out on the server, so give the client you are testing a timeout. Stalled connections are dropped when the server stops.

With the Anthropic SDK, a `stream-error` call makes the stream throw:

```js
const stream = client.messages.stream({
  model: 'claude-opus-5-5',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello' }],
});

try {
  await stream.finalMessage();
} catch (error) {
  // The text received before the failure is incomplete: discard it and retry
}
```
