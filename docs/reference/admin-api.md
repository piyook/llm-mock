# Admin API (changing rules and settings while running)

The config file is read once, when the server starts. The admin API lets a test (or a coding agent) add a response rule to a running server, or change its chaos and delay settings, with no file to write and no restart:

```js
// Before the test: reply to this prompt with this text
await fetch('http://localhost:8001/admin/rules', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ match: 'Classify this ticket', text: '{"priority":"high"}' }),
});

// After the test: back to how the server started
await fetch('http://localhost:8001/admin/reset', { method: 'POST' });
```

| Route | What it does |
|---|---|
| `GET /admin/rules` | Lists every rule in the order requests are matched against them |
| `POST /admin/rules` | Adds a rule: `{ "match", "text" or "content", "in"?, "stopReason"?, "fail"?, "times"? }`. Answers `201` with the rule and its `id` |
| `DELETE /admin/rules/<id>` | Removes one rule added this way |
| `DELETE /admin/rules` | Removes every rule added this way |
| `GET /admin/chaos` | Shows the [chaos](/guide/delay-and-chaos#chaos-mode-error-simulation) settings in use, and how many calls were counted and failed |
| `PATCH /admin/chaos` | Changes the chaos settings it is given: `enabled`, `frequency`, `mode`, `status`, `kind`, `afterChunks` |
| `GET /admin/delay` | Shows the [response delay](/guide/delay-and-chaos#response-delay-simulation) in use |
| `PATCH /admin/delay` | Changes the response delay: `{ "min", "max" }` in milliseconds |
| `GET /admin/settings` | Shows the reply settings in use |
| `PATCH /admin/settings` | Changes the reply settings it is given: `responseType`, `maxLoremParas`, `stream`, `validateRequests`, `logRequests`, `maxLoggedRequests` |
| `GET /admin/requests` | The calls your app made, oldest first (see [Checking what your app sent](#checking-what-your-app-sent)) |
| `GET /admin/requests/<id>` | One recorded call, by its `x-llmock-request-id` |
| `DELETE /admin/requests` | Forgets the recorded calls |
| `GET /admin/recording` | Shows whether the server is [recording](/guide/recording#recording-real-replies), and whether that is paused |
| `PATCH /admin/recording` | Pauses or resumes recording: `{ "paused": true }` or `{ "paused": false }` |
| `POST /admin/reset` | Goes back to how the server started: no rules added this way, no recorded calls, the config file's chaos, delay and reply settings, recording not paused, and the chaos call count and the [recording](/guide/recording#recording-real-replies) counts at 0 |

- A rule added this way works like a [response rule](/guide/response-rules#response-rules-fixture-replies) in the config file: the same `match`, the same optional `in` and `exact`, [`stopReason`](/guide/response-rules#truncated-and-refused-replies-stopreason) and [`fail`](/guide/response-rules#failing-one-prompt-fail). It needs `text`, `content` ([tool calls](/guide/response-rules#tool-calls-claude-content), `claude` only) or `fail`.
- The reply is given as `text` or `content`, never as `file`, `files` or `contentFile`. The server has no login, so a path sent over HTTP would let anyone who can reach it read files from your machine.
- Rules added this way are matched before the config file's rules, in the order they were added. To replace a config rule for one test, add a rule with the same `match`.
- Give a rule `times` (a whole number, 1 or more) to have it answer that many matching requests and then remove itself. A call that [chaos](/guide/delay-and-chaos#chaos-mode-error-simulation) fails does not count, so the rule is still there for the retry. Without `times` a rule stays until you remove it or reset. `times` is for rules added this way only, not for the config file.
- Nothing is saved. The config file is never written, and a restart starts again with the config file's rules only.
- A rule that is not valid gets a `400` with `{ "error": "..." }` and is not added.
- Each rule in a listing has `source` (`"runtime"` or `"config"`), `id` (`null` for a config rule, which can not be removed this way), `in` (`"any"` or `"last"`), `exact` (`true` or `false`), `content` (the tool-call blocks, or `null`) and `times` (how many more requests it answers, or `null` if it stays). A tool-call rule's `stopReason` is `"tool_use"`.
- Everything else (the port, the endpoint, the preset with its template and model name, embeddings, debug mode) still comes from the config file and needs a restart to change.

With `times`, a test can have the first call fail and the retry succeed, or give each call in turn its own reply:

```js
const addRule = (rule) =>
  fetch('http://localhost:8001/admin/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(rule),
  });

// The first call with this prompt gets a 529; the next one gets a normal reply
await addRule({ match: 'Summarise the report', fail: { status: 529 }, times: 1 });

// The first call gets "draft", the second "final", later ones a normal reply
await addRule({ match: 'Write the email', text: 'draft', times: 1 });
await addRule({ match: 'Write the email', text: 'final', times: 1 });
```

To switch what the server replies with for one test:

```js
await fetch('http://localhost:8001/admin/settings', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ responseType: 'stored', stream: true }),
});
```

To make calls fail part-way through a test, switch chaos on and reset afterwards:

```js
await fetch('http://localhost:8001/admin/chaos', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ enabled: true, frequency: 2, status: 429 }),
});
// The 2nd, 4th, 6th... call now fails with a 429
```

- `PATCH` changes only the settings you send; the others stay as they are. The settings mean what they mean in the config file's [`chaos`](/guide/delay-and-chaos#chaos-mode-error-simulation) and [`responseDelay`](/guide/delay-and-chaos#response-delay-simulation).
- A value that is not valid gets a `400` and nothing is changed. Nothing falls back to a default, unlike a CLI flag.
- Changing chaos settings leaves the call count alone. With `mode: "every"`, call `POST /admin/reset` first and then `PATCH /admin/chaos`, so the count starts from 0 and you know which call fails.
- `min` can not be more than `max`, and neither can be more than 2147483647 (about 24 days). Send both when you raise the delay from `0`.
- `PATCH /admin/settings` takes the same names and values as the model preset: `responseType` is `"lorem"` or `"stored"`, `stream`, `validateRequests` and `logRequests` are `true` or `false`, `maxLoremParas` is 1 to 1000 and `maxLoggedRequests` is 1 to 100.
- `"responseType": "stored"` uses the preset's [`storedResponsesFile`](/guide/configuration#response-types) if it has one, otherwise the texts that come with LLMock. If that file can not be read, the change is refused with a `400`.
- `stream` has no effect on the `claude` template, where each request says whether it wants a stream. On an `openai` template it only applies to requests that don't send their own `stream: true`/`false`.
- The dashboard shows the settings in use, so a change appears there within 2 seconds. The **Admin API** box on its **Settings** page has a **Reset** button that does the same as `POST /admin/reset`.
- To turn the admin API off, set `"admin": false` in the `server` block, or start with `--admin=false`. While it is on, a preset's `endpoint` can not start with `admin/`.

## Checking what your app sent

Every call to the chat route and to `/v1/embeddings` is kept in memory, so a test can check what its app sent: the prompt, the system text, the tools, the model or a header.

```js
const { requests } = await (
  await fetch('http://localhost:8001/admin/requests?match=Classify')
).json();
expect(requests).toHaveLength(1);
expect(requests[0].body.system).toContain('You are a triage bot');
```

Each entry has:

| Field | |
|---|---|
| `id` | The same id as the reply's `x-llmock-request-id` header |
| `time` | When the call came in (ISO 8601) |
| `method`, `path`, `query` | The route, without the query string, and the query string's values |
| `headers` | The request headers, names in lower case. `authorization`, `x-api-key`, `api-key`, `x-goog-api-key`, `proxy-authorization` and `cookie` show as `"[redacted]"`, in case a real key is sent to the mock. So do the query parameters `key` (as Gemini clients send it), `api_key`, `api-key`, `apikey` and `access_token`. |
| `body` | The JSON body as sent (`null` for none) |
| `valid` | `false` for a call that failed [request validation](/guide/dashboard-and-logging#request-validation) and got a `400` |
| `streamed` | Whether the reply was a stream; `null` when no reply was sent (a failed validation, or a drop or stall with no stream) |
| `rule` | `{ "id", "match" }` of the [response rule](/guide/response-rules#response-rules-fixture-replies) that answered or failed the call (`id` is `null` for a config rule), or `null` |
| `failed` | How LLMock failed the call on purpose, `{ "by": "rule" or "chaos", "kind", "status", "afterChunks" }`, or `null` |
| `forwarded` | When [recording](/guide/recording#recording-real-replies): `{ "status", "saved" }` for a call sent on to the provider, else `null` |

- Filter with `?match=` (text the body must contain, case-sensitive, as a rule's `match`), `?in=last` (look only in the last message, as a rule's `in`) and `?path=/v1/messages`. An unknown or invalid filter gets a `400`.
- Calls are kept whether or not `logRequests` is on, including calls that fail validation. Unlike the [request log](/guide/dashboard-and-logging#request-logging) nothing is written to disk.
- The last 500 calls are kept; older ones are dropped. `DELETE /admin/requests` or `POST /admin/reset` forgets them, as does a restart.
- Like the rules, this is shared by every client of one server. Tests running in parallel against one server should filter by a `match` of their own, or each [start their own server](/guide/testing-from-code#starting-a-server-from-code-tests).

## Network exposure

LLMock has no authentication, and by default it listens on every network interface (`"host": "0.0.0.0"`). Anyone who can reach the port can change the replies through the admin API, read the calls it recorded (`GET /admin/requests`), and read or clear the [request log](/guide/dashboard-and-logging#request-logging). Both hold the prompts your app sent. Turning the admin API off does not cover the request log.

For a mock server running locally with test data this is not usually a problem. If you want to take extra precautions, you can keep the mock to your own machine:

- Run directly: set `"host": "127.0.0.1"` in the `server` block, or start with `--host=127.0.0.1`.
- Run in Docker: leave `"host": "0.0.0.0"` in the config, which the container needs, and publish the port on the loopback address only, as `"127.0.0.1:8001:8001"`. The [Docker example](/guide/docker#standalone-docker-setup-no-scaffolding) does this. Other containers in the same compose file still reach the mock by its service name.
