# Admin API

Routes for changing a running server: adding response rules, changing chaos, delay and reply settings, and reading the calls your app made. For how to use them in a test, see [Using LLMock in tests](/guide/testing-from-code#changing-replies-from-a-test).

The admin API is on by default. To turn it off, set `"admin": false` in the `server` block, or start with `--admin=false`. It has no login: see [Network exposure](/guide/installation#network-exposure).

## Routes

| Route | What it does |
|---|---|
| `GET /admin/rules` | Lists every rule in the order requests are matched against them |
| `POST /admin/rules` | Adds a rule: `{ "match", "text" or "content", "in"?, "stopReason"?, "fail"?, "times"? }`. Answers `201` with the rule and its `id` |
| `DELETE /admin/rules/<id>` | Removes one rule added this way |
| `DELETE /admin/rules` | Removes every rule added this way |
| `GET /admin/chaos` | Shows the [chaos](/guide/chaos) settings in use, and how many calls were counted and failed |
| `PATCH /admin/chaos` | Changes the chaos settings it is given: `enabled`, `frequency`, `mode`, `status`, `kind`, `afterChunks` |
| `GET /admin/delay` | Shows the [response delay](/guide/delays) in use |
| `PATCH /admin/delay` | Changes the response delay: `{ "min", "max" }` in milliseconds |
| `GET /admin/settings` | Shows the reply settings in use |
| `PATCH /admin/settings` | Changes the reply settings it is given: `responseType`, `maxLoremParas`, `stream`, `validateRequests`, `logRequests`, `maxLoggedRequests` |
| `GET /admin/requests` | The calls your app made, oldest first (see [Checking what your app sent](#checking-what-your-app-sent)) |
| `GET /admin/requests/<id>` | One recorded call, by its `x-llmock-request-id` |
| `DELETE /admin/requests` | Forgets the recorded calls |
| `GET /admin/recording` | Shows whether the server is [recording](/guide/recording), and whether that is paused |
| `PATCH /admin/recording` | Pauses or resumes recording: `{ "paused": true }` or `{ "paused": false }` |
| `POST /admin/reset` | Goes back to how the server started: no rules added this way, no recorded calls, the config file's chaos, delay and reply settings, recording not paused, and the chaos call count and the [recording](/guide/recording) counts at 0 |

## Rules

- A rule added this way works like a [response rule](/guide/response-rules) in the config file: the same `match`, the same optional `in` and `exact`, [`stopReason`](/guide/stop-reasons) and [`fail`](/guide/failing-a-prompt). It needs `text`, `content` ([tool calls](/guide/tool-calls), `claude` only) or `fail`.
- The reply is given as `text` or `content`, never as `file`, `files` or `contentFile`. The server has no login, so a path sent over HTTP would let anyone who can reach it read files from your machine.
- Rules added this way are matched before the config file's rules, in the order they were added. To replace a config rule for one test, add a rule with the same `match`.
- Give a rule `times` (a whole number, 1 or more) to have it answer that many matching requests and then remove itself. A call that [chaos](/guide/chaos) fails does not count, so the rule is still there for the retry. Without `times` a rule stays until you remove it or reset. `times` is for rules added this way only, not for the config file.
- Nothing is saved. The config file is never written, and a restart starts again with the config file's rules only.
- A rule that is not valid gets a `400` with `{ "error": "..." }` and is not added.
- Each rule in a listing has `source` (`"runtime"` or `"config"`), `id` (`null` for a config rule, which can not be removed this way), `in` (`"any"` or `"last"`), `exact` (`true` or `false`), `content` (the tool-call blocks, or `null`) and `times` (how many more requests it answers, or `null` if it stays). A tool-call rule's `stopReason` is `"tool_use"`.

## Chaos, delay and reply settings

- `PATCH` changes only the settings you send; the others stay as they are. The settings mean what they mean in the config file's [`chaos`](/guide/chaos#settings) and [`responseDelay`](/guide/delays).
- A value that is not valid gets a `400` and nothing is changed. Nothing falls back to a default, unlike a CLI flag.
- Changing chaos settings leaves the call count alone. With `mode: "every"`, call `POST /admin/reset` first and then `PATCH /admin/chaos`, so the count starts from 0 and you know which call fails.
- `min` can not be more than `max`, and neither can be more than 2147483647 (about 24 days). Send both when you raise the delay from `0`.
- `PATCH /admin/settings` takes the same names and values as the model preset: `responseType` is `"lorem"` or `"stored"`, `stream`, `validateRequests` and `logRequests` are `true` or `false`, `maxLoremParas` is 1 to 1000 and `maxLoggedRequests` is 1 to 100.
- `"responseType": "stored"` uses the preset's [`storedResponsesFile`](/guide/response-types#your-own-pool) if it has one, otherwise the texts that come with LLMock. If that file can not be read, the change is refused with a `400`.
- `stream` has no effect on the `claude` template, where each request says whether it wants a stream. On an `openai` template it only applies to requests that don't send their own `stream: true`/`false`.
- The dashboard shows the settings in use, so a change appears there within 2 seconds. The **Admin API** box on its **Settings** page has a **Reset** button that does the same as `POST /admin/reset`.
- Everything else (the port, the endpoint, the preset with its template and model name, embeddings, debug mode) still comes from the config file and needs a restart to change.
- While the admin API is on, a preset's `endpoint` can not start with `admin/`.

## Checking what your app sent

`GET /admin/requests` lists the calls to the chat route and to `/v1/embeddings`, oldest first. `startServer`'s `requests()` and `lastRequest()` give the same entries. Each entry has:

| Field | |
|---|---|
| `id` | The same id as the reply's `x-llmock-request-id` header |
| `time` | When the call came in (ISO 8601) |
| `method`, `path`, `query` | The route, without the query string, and the query string's values |
| `headers` | The request headers, names in lower case. `authorization`, `x-api-key`, `api-key`, `x-goog-api-key`, `proxy-authorization` and `cookie` show as `"[redacted]"`, in case a real key is sent to the mock. So do the query parameters `key` (as Gemini clients send it), `api_key`, `api-key`, `apikey` and `access_token`. |
| `body` | The JSON body as sent (`null` for none) |
| `valid` | `false` for a call that failed [request validation](/guide/dashboard-and-logging#request-validation) and got a `400` |
| `streamed` | Whether the reply was a stream; `null` when no reply was sent (a failed validation, or a drop or stall with no stream) |
| `rule` | `{ "id", "match" }` of the [response rule](/guide/response-rules) that answered or failed the call (`id` is `null` for a config rule), or `null` |
| `failed` | How LLMock failed the call on purpose, `{ "by": "rule" or "chaos", "kind", "status", "afterChunks" }`, or `null` |
| `forwarded` | When [recording](/guide/recording): `{ "status", "saved" }` for a call sent on to the provider, else `null` |

- Filter with `?match=` (text the body must contain, case-sensitive, as a rule's `match`), `?in=last` (look only in the last message, as a rule's `in`) and `?path=/v1/messages`. An unknown or invalid filter gets a `400`.
- Calls are kept whether or not `logRequests` is on, including calls that fail validation. Unlike the [request log](/guide/dashboard-and-logging#request-logging) nothing is written to disk.
- The last 500 calls are kept; older ones are dropped. `DELETE /admin/requests` or `POST /admin/reset` forgets them, as does a restart.
- Like the rules, this is shared by every client of one server. Tests running in parallel against one server should filter by a `match` of their own, or each [start their own server](/guide/testing-from-code#starting-a-server-from-code-tests).
