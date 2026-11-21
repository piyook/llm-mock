# Using LLMock in tests

From a test runner such as Vitest you can start a mock server in the test process itself, point your SDK client at it, and then check what your code sent.

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

`requests(filter?)` gives the calls the server received, oldest first, as [`GET /admin/requests`](/reference/admin-api#checking-what-your-app-sent) does (it also works with the admin API off). `lastRequest(filter?)` gives the most recent one. The filter is `{ match?, in?, path? }`:

```ts
await myApp.classify('Printer on fire');
const call = server.lastRequest({ match: 'Printer on fire' });
expect(call?.body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 1024 });
expect(call?.headers['anthropic-version']).toBe('2023-06-01');
```

- One server per process at a time: settings live in environment variables and module state, so a second `startServer` before `close()` throws. Vitest runs each test file in its own process by default, so files can each run their own server in parallel. A server started after an earlier one is closed starts clean (no runtime rules, chaos count at 0).
- LLMock ships TypeScript source, so import it from a runner that loads TypeScript (Vitest, tsx). Plain `node` will not load it from `node_modules`; use the CLI with `--port=0` there.
- The [request log](/guide/dashboard-and-logging#request-logging) is one file shared by every LLMock server on the machine, so servers running in parallel log into the same file.
