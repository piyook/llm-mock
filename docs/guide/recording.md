# Recording real replies

Instead of writing fixtures by hand, let LLMock record them: calls that no rule answers go to the real provider once, and its reply is saved as a fixture file and a response rule. From then on the same call is answered from the recording, with no network, no API key and no cost.

```bash
# Record: send the calls no rule answers to Anthropic, and save the replies
llmock start --model=claude --record=https://api.anthropic.com

# Later, or in CI: replay only (the recordings folder is read without --record)
llmock start --model=claude
```

Or in the preset:

```json
"claude": {
  "name": "claude",
  "endpoint": "v1/messages",
  "recordings": { "dir": "recordings", "upstream": "https://api.anthropic.com" }
}
```

While recording, give your client a real API key: the call is sent on with its headers, so the provider gets the key your client sent. Headers are never saved. For replaying, any key will do.

- `upstream` is the provider's base URL, such as `https://api.anthropic.com`, `https://api.openai.com` or `https://generativelanguage.googleapis.com` (a trailing `/v1` or `/v1beta` is fine too). LLMock adds the provider's own path for the call, whatever the preset's `endpoint` is: `/v1/messages` (Claude), `/v1/chat/completions` (OpenAI, also from the stock `chatgpt/chat/completions`), `/v1/responses` (the [Responses API](/guide/integration#responses-api-openai)) and `/v1beta/models/<model>:generateContent` (Gemini, with the model from the preset's endpoint). The call's query string is kept, and a path in `upstream` (a proxy's prefix) is kept in front. An `upstream` with a user name or password in it (`https://user:pass@...`) stops the server from starting: give a proxy its login in a header your client sends.
- `dir` (default `recordings`, relative to the config file) gets `rules.json` and one fixture per recording: `0001-what-is-the-capital-of-france.txt`, or a `.json` [`contentFile`](/guide/response-rules#tool-calls-claude-content) for a Claude tool-call reply. The rules are read on every request, after the config file's own `responseRules`, so you can edit, reorder or delete them, or move them into the config file. With `dir` set and no `upstream`, LLMock only replays. If an edit leaves `rules.json` broken while the server runs, the recorded rules are skipped (the server prints why) until you fix it, and nothing new is saved over it; a broken file stops the server from starting.
- A recorded rule matches the call's whole last message, with `"in": "last"` and `"exact": true` (see [Response rules](/guide/response-rules#response-rules-fixture-replies)): a recording of `Hi` answers `Hi`, not `Hi there`. Ids such as a `tool_result`'s `tool_use_id` are left out, so the steps of a recorded tool loop replay even though each replayed tool call gets a new id. Remove `exact` from a rule to have it answer any last message that contains its `match`.
- A cut-off reply is saved with `"stopReason": "max_tokens"` and a refused one with `"stopReason": "refusal"`, so they replay the same way. A Claude tool-call reply is saved without its ids, so each replay gets new ones. Thinking blocks are left out.
- LLMock always asks the provider for a whole reply, then answers in its own format, streamed if the call asked for a stream. The first call and every replay look the same to your app.
- An error status from the provider, or a reply LLMock can not read, is sent back as it came and not saved (the server prints why). OpenAI and Gemini tool (function) calls are not recorded. If the call asked for a stream, a successful reply that wasn't saved can't be sent as it came (it is one JSON body, not a stream), so the client gets a `502` saying why instead. A provider that can not be reached gives a `502`.
- Rules from the config file and the [admin API](/reference/admin-api#admin-api-changing-rules-and-settings-while-running) still win, and [chaos](/guide/delay-and-chaos#chaos-mode-error-simulation) still fails calls before anything is sent on.
- [`GET /admin/requests`](/reference/admin-api#checking-what-your-app-sent) shows which calls were sent on, as `forwarded: { "status", "saved" }`. So does the request log (as `request_validation.forwarded`), and the dashboard's log viewer marks those calls.
- To stop sending calls on for a while without a restart, pause recording: `PATCH /admin/recording` with `{ "paused": true }`, or the switch on the dashboard. While paused, a call no rule answers gets a normal mock reply and nothing is sent or saved; the recorded rules still answer. `{ "paused": false }`, `POST /admin/reset` or a restart resumes it.
- On the dashboard, the **Recording** card (Settings page) shows whether the server is recording, paused, replaying or neither, the upstream, the recordings folder, and how many calls were sent on and saved since it started or was reset. Recorded rules are listed last on the Response rules page, marked `recorded`.
- The recordings hold your real prompts and the provider's replies. Look at them before you commit them to a shared repository.
