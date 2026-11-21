# Truncated and refused replies

A real model does not always finish its answer: it can run out of tokens, or decline. To test how your app handles that, give a [response rule](/guide/response-rules) a `stopReason`:

```json
{
  "responseRules": [
    { "match": "Summarise this", "file": "fixtures/cut-off.txt", "stopReason": "max_tokens" },
    { "match": "Write the exploit", "file": "fixtures/refused.txt", "stopReason": "refusal" }
  ]
}
```

The reply text is still the fixture, exactly as written. LLMock does not shorten it, so write a fixture that stops part-way through a sentence (or part-way through a JSON object, to test your parser).

## What each provider gets

| `stopReason` | `claude` | `openai` (and custom templates) | `gemini` |
|---|---|---|---|
| `end` (the default) | `stop_reason: "end_turn"` | `finish_reason: "stop"` | `finishReason: "STOP"` |
| `max_tokens` | `stop_reason: "max_tokens"` | `finish_reason: "length"` | `finishReason: "MAX_TOKENS"` |
| `refusal` | `stop_reason: "refusal"` | `finish_reason: "content_filter"` | `finishReason: "SAFETY"` |

## Details

- It works with `file` and `files`, and with static and streamed replies. In a `claude` stream the value is in the `message_delta` event; in an OpenAI-style stream it is the last chunk's `finish_reason`. A streamed `gemini` reply is OpenAI-style, so it carries the `openai` value.
- A refused `claude` reply also carries the `stop_details` object the Anthropic API sends with a refusal: `{ "type": "refusal", "category": null, "explanation": null }`.
- A rule without `stopReason` behaves exactly as before. Any other value stops the server at startup.
- A [tool-call](/guide/tool-calls) rule's reply ends with `tool_use`.
