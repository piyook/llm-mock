# Using LLMock in tests

From a test runner such as Vitest you can start a mock server in the test process itself, point your SDK client at it, set the replies each test needs, and then check what your code sent.

## Starting a server from code (tests)

`startServer` runs a mock server inside your test process, with no CLI, fixed port or background process to clean up:

```ts
import { startServer } from 'llmock';

const server = await startServer({ config: '.llmockrc.json', model: 'claude', port: 0 });
// server.port: the port it got; server.url: 'http://127.0.0.1:54321'
const client = new Anthropic({ apiKey: 'mock', baseURL: server.url });
// ...
await server.close();
```

In Vitest, start it in `beforeAll` and close it in `afterAll`. Options, all optional:

| Option | Default | |
|---|---|---|
| `config` | `./.llmockrc.json`, else the built-in presets | A config file path (relative to the working directory), or the config object itself. Rule and stored-response files resolve against the file's folder (the working directory for an object). |
| `model` | the config's `defaultModel` | Preset to run |
| `port` | the config's `server.port` | `0` picks a free port |
| `host` | `127.0.0.1` | Address to listen on. Not taken from the config, so a test server stays off the network unless you ask. |
| `settings` | | Any [CLI option](/reference/cli#cli-options) by name, e.g. `{ stream: true, delayMin: 0, chaos: true }` |

It returns `{ port, host, url, requests(), lastRequest(), clearRequests(), close() }`; `close()` stops the server and puts back the environment variables it set.

- One server per process at a time: settings live in environment variables and module state, so a second `startServer` before `close()` throws. Vitest runs each test file in its own process by default, so files can each run their own server in parallel. A server started after an earlier one is closed starts clean (no runtime rules, chaos count at 0).
- LLMock ships TypeScript source, so import it from a runner that loads TypeScript (Vitest, tsx). Plain `node` will not load it from `node_modules`; use the CLI with `--port=0` there.
- The [request log](/guide/dashboard-and-logging#request-logging) is one file shared by every LLMock server on the machine, so servers running in parallel log into the same file.

## Changing replies from a test

The config file is read once, when the server starts. The [admin API](/reference/admin-api) lets a test (or a coding agent) add a response rule to a running server, or change its chaos and delay settings, with no file to write and no restart. It works on a server started with `startServer` (use its `url`) and on one started from the CLI:

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

### A reply for each call in turn

With `times`, a rule answers that many matching requests and then removes itself. A test can have the first call fail and the retry succeed, or give each call in turn its own reply:

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

To script each step of a Claude tool loop this way, see [Tool calls](/guide/tool-calls#scripting-a-loop-from-a-test).

### Switching settings for one test

To switch what the server replies with:

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

Every route, and what each setting accepts, is in the [admin API reference](/reference/admin-api).

## Checking what your app sent

Every call to the chat route and to `/v1/embeddings` is kept in memory, so a test can check what its app sent: the prompt, the system text, the tools, the model or a header.

With `startServer`, `requests(filter?)` gives the calls the server received, oldest first (it also works with the admin API off). `lastRequest(filter?)` gives the most recent one. The filter is `{ match?, in?, path? }`:

```ts
await myApp.classify('Printer on fire');
const call = server.lastRequest({ match: 'Printer on fire' });
expect(call?.body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 1024 });
expect(call?.headers['anthropic-version']).toBe('2023-06-01');
```

Against a server started from the CLI, use `GET /admin/requests`:

```js
const { requests } = await (
  await fetch('http://localhost:8001/admin/requests?match=Classify')
).json();
expect(requests).toHaveLength(1);
expect(requests[0].body.system).toContain('You are a triage bot');
```

The fields of each call, and the filters, are in the [admin API reference](/reference/admin-api#checking-what-your-app-sent).

::: tip Tests running in parallel
The rules and the recorded calls are shared by every client of one server. Tests running in parallel against one server should filter by a `match` of their own, or each start their own server with `startServer`.
:::
