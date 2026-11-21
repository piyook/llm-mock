# Configuration

## Configuration file (`.llmockrc.json`)

All settings live in `.llmockrc.json` in your project root. CLI flags always override these values. `defaultModel` names the preset used when you don't pass `--model`.

The config file is read once at startup, so restart the server after changing it. Fixture files and the stored responses file are read on every request, so edits to those apply straight away.

```json
{
  "defaultModel": "chatgpt",
  "models": {
    "chatgpt": {
      "name": "openai",
      "model": "gpt-4o",
      "endpoint": "chatgpt/chat/completions",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "logRequests": true,
      "debug": false,
      "stream": false,
      "responseDelay": {
        "min": 3000,
        "max": 5000
      },
      "embeddings": {
        "enabled": true,
        "dimensions": 128
      },
      "chaos": {
        "enabled": false,
        "frequency": 1,
        "mode": "every",
        "status": 500,
        "kind": "http",
        "afterChunks": 2
      }
    }
  },
  "server": {
    "port": 8001,
    "host": "0.0.0.0"
  }
}
```

**Configuration reference:**

| Option | Description |
|---|---|
| `name` | **Required.** LLM provider name (used for template loading) |
| `model` | Model identifier (e.g. `gpt-4o`, `gemini-pro`) |
| `endpoint` | **Required.** API endpoint path (not `v1/embeddings` while embeddings are enabled) |
| `responseType` | `"lorem"` (random text) or `"stored"` (predefined responses) |
| `storedResponsesFile` | Optional JSON file of your own texts for `"stored"` (see [Response types](#response-types)) |
| `recordings` | Optional `{ "dir", "upstream" }`: replay recorded replies from `dir`, and with `upstream` record new ones (see [Recording real replies](/guide/recording#recording-real-replies)) |
| `maxLoremParas` | Max sentences in lorem ipsum responses |
| `validateRequests` | Validate incoming requests against templates |
| `logRequests` | Save the most recent requests to the log file |
| `maxLoggedRequests` | How many requests the log keeps (default `10`, at most `100`) |
| `debug` | Enable verbose console logging |
| `stream` | Return SSE streaming responses. For `openai` presets, only for requests that don't send their own `stream: true`/`false`; ignored by the `claude` preset, which decides per request |
| `responseDelay.min/max` | Response delay range in milliseconds |
| `responseRules` | Optional list of `{ match, file }` or `{ match, files }` fixture replies, each with an optional `stopReason`, or `{ match, fail }` to fail the calls that match (see [Response rules](/guide/response-rules#response-rules-fixture-replies)) |
| `chaos.enabled` | Fail some calls (see [Chaos mode](/guide/delay-and-chaos#chaos-mode-error-simulation)) |
| `chaos.frequency` | Fail 1 in this many calls (default `1`, every call) |
| `chaos.mode` | `"every"` (each Xth call, the default) or `"random"` (a 1 in X chance per call) |
| `chaos.status` | HTTP status of the error, `400` to `599` (default `500`) |
| `chaos.kind` | What a failing call gets: `"http"` (an HTTP error, the default), `"stream-error"`, `"stream-drop"` or `"stream-stall"` (see [Stream failures](/guide/delay-and-chaos#stream-failures)) |
| `chaos.afterChunks` | How many content deltas a failing stream sends first, `0` or more (default `2`) |
| `embeddings.enabled` | Enable the `/v1/embeddings` endpoint |
| `embeddings.dimensions` | Embedding vector size |
| `server.port` / `server.host` | Port and address the server listens on (`8001`, `0.0.0.0`) |
| `server.admin` | `false` turns the [admin API](/reference/admin-api#admin-api-changing-rules-and-settings-while-running) off (default `true`) |
| `server.uiTheme` | Colours of the [dashboard](/guide/dashboard-and-logging#dashboard): `"dark"` (the default) or `"light"` |
| `server.llmspy` | `true`, or LLMSpy's address such as `"http://127.0.0.1:9090"`: print the LLMSpy upstream and base URL at start, and show them on the dashboard (see [Using with LLMSpy](/guide/llmspy#using-with-llmspy)). Off by default |

Only `name` and `endpoint` are required in a preset. Anything left out uses: `responseType` `lorem`, `maxLoremParas` 8, `maxLoggedRequests` 10, no delay, and validation, logging, debug, streaming, embeddings and chaos off.

## Adding custom models

Extend the `models` object with any additional preset, then start with `--model=<name>`:

```json
{
  "models": {
    "my-model": {
      "name": "openai",
      "model": "gpt-3.5-turbo",
      "endpoint": "api/v1/chat/completions",
      "responseType": "stored",
      "validateRequests": true,
      "logRequests": false,
      "debug": true,
      "stream": false,
      "responseDelay": { "min": 1000, "max": 2000 },
      "embeddings": { "enabled": false, "dimensions": 64 }
    }
  }
}
```

```bash
llmock start --model=my-model
```

## Response types

**Lorem ipsum** — generates random placeholder text, good for testing variable-length content in the UI:

```json
{ "responseType": "lorem", "maxLoremParas": 8 }
```

**Stored responses** — returns one text from a pool, picked at random on each request. Without further settings the pool is a small set of fixed sentences bundled with the package:

```json
{ "responseType": "stored" }
```

To use your own pool, point `storedResponsesFile` at a JSON file:

```json
{ "responseType": "stored", "storedResponsesFile": "fixtures/replies.json" }
```

The file is a JSON array of strings:

```json
["First canned reply.", "Second canned reply.", "Third canned reply."]
```

- Entries can also be objects with a string `content`, the shape of the bundled data: `[{ "id": 1, "content": "First canned reply." }]`. Other keys are ignored.
- The path is resolved relative to the folder holding the config file.
- A path that is empty or not a string stops the server at startup. When the response type is `stored`, so does a file that is missing, unreadable, not valid JSON, not an array, an empty array, or that has an entry of any other shape.
- The file is checked at startup and then read again on every request, so you can edit it without restarting. If it becomes invalid while the server is running, requests return an error rather than falling back to the bundled sentences.
- A matching [response rule](/guide/response-rules#response-rules-fixture-replies) still wins. Use rules for a specific reply to a specific request, and stored responses for random variety on everything else.
- Works with every preset and with both static and streamed replies.

## Custom API paths

Set the endpoint to match any provider's path structure:

| `endpoint` | URL |
|---|---|
| `chatgpt/chat/completions` | `http://localhost:8001/chatgpt/chat/completions` |
| `models/gemini-pro:generateContent` | `http://localhost:8001/models/gemini-pro:generateContent` |

Write the path without a leading slash.

## Environment variables

LLMock does not read any of these itself. They are a suggested convention for your own app, so it can switch between the mock and the real provider (the [LangChain example](/guide/integration#using-with-langchain) uses them):

```bash
TEST_MODE=true
TEST_BASE_URL=http://localhost:8001/chatgpt
TEST_EMBEDDING_URL=http://localhost:8001/v1/embeddings
```

With `TEST_MODE=false` your app talks to the real LLM service again.
