# Supporting Different LLM Providers

LLMock supports any provider that uses the OpenAI chat completion format: ChatGPT, Grok, Llama, DeepSeek, Mistral, Gemini, and more. Anthropic's Messages API has its own built-in preset (below). For other providers with different request/response shapes, create custom templates.

## Anthropic (Claude Messages API)

The `claude` preset serves `POST /v1/messages`. It is included in scaffolded projects and in the built-in defaults. If your `.llmockrc.json` predates it, add:

```json
{
  "models": {
    "claude": {
      "name": "claude",
      "model": "claude-opus-5-5",
      "endpoint": "v1/messages",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "stream": false,
      "responseDelay": { "min": 200, "max": 800 },
      "embeddings": { "enabled": false, "dimensions": 128 }
    }
  }
}
```

```bash
llmock start --model=claude
```

Point the official SDK at it with a base URL and a dummy key (the SDK refuses to send without one):

```bash
ANTHROPIC_BASE_URL=http://localhost:8001 ANTHROPIC_API_KEY=mock-key node app.js
```

```js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ baseURL: 'http://localhost:8001', apiKey: 'mock-key' });
const message = await client.messages.stream({
  model: 'claude-opus-5-5',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello' }],
}).finalMessage();
```

Or with curl:

```bash
curl http://localhost:8001/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: mock-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-opus-5-5",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Behaviour:

- **Request validation** requires only `model`, `max_tokens` and `messages`. Extra fields (`system`, `output_config`, `temperature`, ...) are accepted.
- **Streaming is per request.** `"stream": true` returns Anthropic SSE events in order: `message_start`, `content_block_start`, `content_block_delta` (text deltas that rejoin to the full text), `content_block_stop`, `message_delta` (`stop_reason: "end_turn"`), `message_stop`. Otherwise a single `message` object is returned. The preset's `stream` setting is ignored.
- **Stop reasons.** A reply ends with `end_turn` unless its response rule sets a [`stopReason`](/guide/response-rules#truncated-and-refused-replies-stopreason) of `max_tokens` or `refusal`. A refusal also carries `stop_details`.
- **Tool calls.** A response rule with [`content`](/guide/response-rules#tool-calls-claude-content) replies with `tool_use` blocks and `stop_reason: "tool_use"`, streamed or not, so a manual tool loop can run against the mock. `"in": "last"` lets each step's rule match its own `tool_result`.
- **Mid-stream failures.** [Chaos mode](/guide/delay-and-chaos#stream-failures) can fail a stream part-way through with an `event: error`, a cut connection or a stall. A response rule with [`fail`](/guide/response-rules#failing-one-prompt-fail) does the same for one prompt.
- **Responses** have a unique `msg_` id, echo the requested `model`, and report estimated `usage` (about 4 characters per token).
- [Response rules](/guide/response-rules#response-rules-fixture-replies) and [stored responses](/guide/configuration#response-types) work here too. Rules match against `system` as well as `messages`.

## Template locations

The framework checks two locations, in priority order:

1. `./request-templates/` and `./response-templates/` in the folder that holds your `.llmockrc.json`
2. `src/request-templates/` and `src/response-templates/` in the package source

Templates are named `<name>_req.json` and `<name>_res.json`, where `<name>` is the preset's `name` field. Scaffolded projects already have these folders; otherwise create them yourself. Project-level templates take priority, so you can add custom templates without modifying the package.

## Creating a custom provider template

**Step 1 — Request template** (`request-templates/<name>_req.json`):

The file is a JSON array holding one example request. Its top-level keys are the ones a request must contain when validation is on:

```json
[
  {
    "model": "string",
    "messages": [
      { "role": "string", "content": "string" }
    ]
  }
]
```

**Step 2 — Response template** (`response-templates/<name>_res.json`):

Also a JSON array holding one object. Use `DYNAMIC_CONTENT_HERE` as the placeholder for the reply text:

```json
[
  {
    "id": "chatcmpl-123",
    "object": "chat.completion",
    "choices": [
      {
        "message": {
          "role": "assistant",
          "content": "DYNAMIC_CONTENT_HERE"
        },
        "finish_reason": "stop"
      }
    ]
  }
]
```

**Step 3 — Model preset** (`.llmockrc.json`):

The `name` field must match your template filename prefix:

```json
{
  "models": {
    "mymodel": {
      "name": "mymodel",
      "model": "my-custom-model-v1",
      "endpoint": "api/v1/chat/completions",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "stream": false,
      "responseDelay": { "min": 1000, "max": 2000 },
      "embeddings": { "enabled": true, "dimensions": 128 }
    }
  }
}
```

**Step 4 — Start and test:**

```bash
llmock start --model=mymodel

curl http://localhost:8001/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "my-custom-model-v1", "messages": [{"role": "user", "content": "Hello"}]}'
```
