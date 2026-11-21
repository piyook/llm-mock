# Config file reference

Every key of `.llmockrc.json`. For how presets work and when changes apply, see [Configuration](/guide/configuration).

## Full example

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

## Preset keys

| Option | Description |
|---|---|
| `name` | **Required.** LLM provider name (used for template loading) |
| `model` | Model identifier (e.g. `gpt-4o`, `gemini-pro`) |
| `endpoint` | **Required.** API endpoint path (not `v1/embeddings` while embeddings are enabled) |
| `responseType` | `"lorem"` (random text) or `"stored"` (predefined responses) |
| `storedResponsesFile` | Optional JSON file of your own texts for `"stored"` (see [Generated and stored replies](/guide/response-types)) |
| `recordings` | Optional `{ "dir", "upstream" }`: replay recorded replies from `dir`, and with `upstream` record new ones (see [Recording real replies](/guide/recording)) |
| `maxLoremParas` | Max sentences in lorem ipsum responses |
| `validateRequests` | Validate incoming requests against templates |
| `logRequests` | Save the most recent requests to the log file |
| `maxLoggedRequests` | How many requests the log keeps (default `10`, at most `100`) |
| `debug` | Enable verbose console logging |
| `stream` | Return SSE streaming responses. For `openai` presets, only for requests that don't send their own `stream: true`/`false`; ignored by the `claude` preset, which decides per request |
| `responseDelay.min/max` | Response delay range in milliseconds (see [Response delays](/guide/delays)) |
| `responseRules` | Optional list of `{ match, file }` or `{ match, files }` fixture replies, each with an optional `stopReason`, or `{ match, fail }` to fail the calls that match (see [Response rules](/guide/response-rules)) |
| `chaos.enabled` | Fail some calls (see [Chaos mode](/guide/chaos)) |
| `chaos.frequency` | Fail 1 in this many calls (default `1`, every call) |
| `chaos.mode` | `"every"` (each Xth call, the default) or `"random"` (a 1 in X chance per call) |
| `chaos.status` | HTTP status of the error, `400` to `599` (default `500`) |
| `chaos.kind` | What a failing call gets: `"http"` (an HTTP error, the default), `"stream-error"`, `"stream-drop"` or `"stream-stall"` (see [Stream failures](/guide/chaos#stream-failures)) |
| `chaos.afterChunks` | How many content deltas a failing stream sends first, `0` or more (default `2`) |
| `embeddings.enabled` | Enable the `/v1/embeddings` endpoint |
| `embeddings.dimensions` | Embedding vector size |

## Server keys

| Option | Description |
|---|---|
| `server.port` / `server.host` | Port and address the server listens on (`8001`, `0.0.0.0`) |
| `server.admin` | `false` turns the [admin API](/reference/admin-api) off (default `true`) |
| `server.uiTheme` | Colours of the [dashboard](/guide/dashboard-and-logging#dashboard): `"dark"` (the default) or `"light"` |
| `server.llmspy` | `true`, or LLMSpy's address such as `"http://127.0.0.1:9090"`: print the LLMSpy upstream and base URL at start, and show them on the dashboard (see [Using with LLMSpy](/guide/llmspy)). Off by default |

## Defaults

Only `name` and `endpoint` are required in a preset. Anything left out uses: `responseType` `lorem`, `maxLoremParas` 8, `maxLoggedRequests` 10, no delay, and validation, logging, debug, streaming, embeddings and chaos off.
