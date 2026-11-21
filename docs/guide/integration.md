# Integration Guide

## Chat completions

### Standard (non-streaming)

```bash
curl http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 1,
    "stream": false
  }'
```

```json
{
  "id": "chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe",
  "object": "chat.completion",
  "created": 1678485525,
  "model": "gpt-4o-mini",
  "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
  "choices": [{"message": {"role": "assistant", "content": "Generated response"}}]
}
```

`model` echoes the request's `model` (the preset's `model` when the request has none), and `usage` is estimated at about 4 characters per token: the request's `messages` in, the reply text out.

### Streaming

Send `"stream": true` to the same endpoint (or set `stream: true` in the preset for requests that don't say):

```bash
curl -N http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

## Responses API (OpenAI)

A preset with the `openai` template (such as `chatgpt` or `streaming`) also serves the [Responses API](https://platform.openai.com/docs/api-reference/responses), which `client.responses.create()` in the OpenAI SDKs calls. It is at `/v1/responses`, and also at `/<prefix>/responses` when the chat endpoint is `/<prefix>/chat/completions`, so one base URL works for both:

```ts
import OpenAI from 'openai';

// The stock chatgpt preset: chat at /chatgpt/chat/completions, responses at /chatgpt/responses
const client = new OpenAI({ apiKey: 'mock', baseURL: 'http://localhost:8001/chatgpt' });

const response = await client.responses.create({
  model: 'gpt-5.1',
  instructions: 'Answer briefly.',
  input: 'Classify this ticket',
});
console.log(response.output_text);
```

- The reply is one assistant `message` output item with one `output_text` part. `model`, `instructions`, `max_output_tokens`, `metadata`, `tools`, `temperature` and the other request settings are echoed back, and `usage` is estimated at about 4 characters per token (`instructions` and `input` in, the reply out).
- `"stream": true` streams the API's events: `response.created`, `response.in_progress`, `response.output_item.added`, `response.content_part.added`, `response.output_text.delta` (several), `response.output_text.done`, `response.content_part.done`, `response.output_item.done` and `response.completed` with the whole response. Each has a `sequence_number`. There is no `[DONE]`. A request with no `stream` goes by the preset's `stream` setting, as on the chat route.
- [Response rules](/guide/response-rules#response-rules-fixture-replies), [`stopReason`](/guide/response-rules#truncated-and-refused-replies-stopreason), [`fail`](/guide/response-rules#failing-one-prompt-fail), [chaos](/guide/delay-and-chaos#chaos-mode-error-simulation), the [delay](/guide/delay-and-chaos#response-delay-simulation), [validation](/guide/dashboard-and-logging#request-validation) (`model` and `input`), the [request log](/guide/dashboard-and-logging#request-logging) and the [recorded requests](/reference/admin-api#checking-what-your-app-sent) all work as they do on the chat route. A rule matches text anywhere in the body, `instructions` included. With `"in": "last"` it looks only at the last `input` item (its `content`, or a tool result's `output`), or at `input` itself when it is a string.
- `stopReason: "max_tokens"` makes the response `incomplete` with `incomplete_details: { "reason": "max_output_tokens" }`, and a stream ends with `response.incomplete`. `stopReason: "refusal"` puts the text in a `refusal` part, streamed as `response.refusal.delta` events.
- A chaos `stream-error` sends the opening events and `afterChunks` deltas, then an `error` event (`{ "type": "error", "code", "message", "param", "sequence_number" }`), and ends the stream. An HTTP failure has the chat route's OpenAI error body.
- Not mocked: tool calls (`function_call` output items), reasoning items, conversation state (`previous_response_id` is echoed but not used), and the other Responses routes (`GET /v1/responses/<id>`, cancel, input items).

## Embeddings API

The mock server provides an OpenAI-compatible embeddings endpoint at `/v1/embeddings`:

```bash
curl http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Your text string goes here"
  }'
```

Pass an array of strings for multiple embeddings in one call:

```bash
-d '{"model": "text-embedding-ada-002", "input": ["First text", "Second text"]}'
```

**Response format:**

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.1234, -0.5678, 0.9012]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": { "prompt_tokens": 6, "total_tokens": 6 }
}
```

Key characteristics of mock embeddings: deterministic (same input always returns the same vector), configurable dimensions, model-name-sensitive, and OpenAI-compatible in shape. Note that vectors are pseudo-random — they have the correct shape for testing but are not real semantic embeddings.

## Using with LangChain

Point your `ChatOpenAI` client at the mock server when `TEST_MODE` is enabled:

```javascript
import { ChatOpenAI } from '@langchain/openai';

const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  configuration:
    process.env.TEST_MODE === 'true'
      ? { baseURL: process.env.TEST_BASE_URL } // http://localhost:8001/chatgpt
      : {},
});
```

For embeddings, use LangChain's built-in fake embeddings or call the mock endpoint directly:

```javascript
class MockEmbeddingsAPI {
  async embedDocuments(texts) {
    return Promise.all(texts.map(text => this.embedQuery(text)));
  }

  async embedQuery(text) {
    const response = await fetch(process.env.TEST_EMBEDDING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: 'text-embedding-ada-002' }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  }
}

const embeddings =
  process.env.TEST_MODE === 'true'
    ? new MockEmbeddingsAPI()
    : new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY });
```
