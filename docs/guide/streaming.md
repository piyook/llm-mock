# Streaming responses

As with the real APIs, the request decides whether it gets a stream:

- **`openai` presets:** a request with `"stream": true` gets an OpenAI-style Server-Sent Events (SSE) stream, and one with `"stream": false` gets a single JSON reply, whatever the preset says. A request with no `stream` key (or a `GET`) goes by the preset's `stream` setting.
- **`claude` preset:** it streams when the request body has `"stream": true`, and the preset setting is ignored (see [Anthropic](/guide/providers#anthropic-claude-messages-api)).
- **`gemini` and custom presets:** the preset's `stream` setting decides, since real Gemini chooses streaming by URL, not by a body field.

Set the preset default in your config or via CLI:

```json
{ "stream": true }
```

```bash
llmock start --stream=true
```

When a request streams, the endpoint returns a chunked SSE stream. The server waits for the configured response delay, then sends the chunks at least 50 ms apart.

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-124","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: [DONE]
```
