# Response rules

Generated text is fine for UI work, but some callers expect a specific reply, such as JSON that gets parsed. A response rule returns a reply you choose whenever a request contains a given string.

## Your first rule

Add `responseRules` to a preset in `.llmockrc.json`:

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

With a request whose message contains `Classify this support ticket`, the server replies with `fixtures/triage.json` as the message text, so the client can `JSON.parse` it. Anything that matches no rule gets the normal response for the preset's [`responseType`](/guide/response-types).

Rules work with every preset and with both static and streamed replies.

## Where the reply comes from

A rule has exactly one of these:

| Key | Reply |
|---|---|
| `file` | The contents of a file |
| `files` | One of several files, picked at random on each matching request |
| `text` | The text in the rule itself |
| `content` / `contentFile` | Claude tool calls: see [Tool calls](/guide/tool-calls) |

```json
{ "match": "Summarise the thread", "files": ["fixtures/summary-a.txt", "fixtures/summary-b.txt"] }
{ "match": "Classify this support ticket", "text": "{\"priority\":\"high\"}" }
```

- `file` is resolved relative to the folder holding the config file, and is read exactly as written (including any trailing newline). It is read on every request, so you can edit it without restarting.
- `files` must be a non-empty list of non-empty strings.

## How matching works

- `match` is a case-sensitive substring, tested against every string value in the request body (message text, system prompt, content blocks), not against JSON keys.
- Rules are checked in order and the first match wins. `match` and `file` must be non-empty strings.
- GET requests have no body, so rules never apply to them.
- Matching covers the whole request, including earlier turns of a conversation (and, for Claude, the `tools` list). A rule that matched an early message keeps matching on every later turn, so use distinctive markers and put more specific rules first.

### Matching only the newest message

Give the rule `"in": "last"` to look for its `match` only in the content of the last entry of `messages` (including any `tool_result` content; for Gemini, the parts of the last entry of `contents`), not in earlier turns, the system prompt or the tools. Ids copied from an earlier reply (a `tool_result`'s `tool_use_id`, `tool_call_id`, `call_id`, `id`) are not looked in either. `"in": "any"` is the default.

### Exact matches

A rule matches text that *contains* its `match`. Add `"exact": true` to match only when the text looked in is `match` and nothing more: with `"in": "last"`, a rule for `Hi` then answers `Hi` but not `Hi there`. The last message's strings are joined with a newline, so a Claude `tool_result` of `21C` reads `tool_result` + newline + `21C`.

## More a rule can do

- **End the reply early or refuse:** [Truncated and refused replies](/guide/stop-reasons)
- **Fail one prompt** with an HTTP or stream error: [Failing one prompt](/guide/failing-a-prompt)
- **Reply with Claude tool calls**, to test an agent's tool loop: [Tool calls](/guide/tool-calls)
- **Add a rule while the server is running**, from a test: [Using LLMock in tests](/guide/testing-from-code#changing-replies-from-a-test)
- **Record real replies as rules:** [Recording real replies](/guide/recording)

## Errors

A malformed rule stops the server at startup. An unreadable fixture (including any entry of `files`) logs a warning at startup, and a request that needs it returns an error rather than falling back to generated text.
