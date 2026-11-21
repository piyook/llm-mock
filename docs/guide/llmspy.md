# Using with LLMSpy

[LLMSpy](https://github.com/piyook/llmspy) ([npm](https://www.npmjs.com/package/llmspy)) is a small local proxy that shows LLM API traffic live in a web UI. You point an app's base URL at LLMSpy, and it forwards each call to the real API while keeping a copy. You can read each call as a conversation (system prompt, tools, messages, tool calls with their results, the reply, its stop reason and tokens), as the raw headers and bodies, or next to an earlier call to see what changed.

LLMock and LLMSpy work together. Use LLMock as LLMSpy's upstream in place of the real provider, and the whole loop runs on your machine, with no API key, no network and no cost:

```
your app ──► LLMSpy (127.0.0.1:8080) ──► LLMock (localhost:8001)
              shows each call             sends the reply
```

This lets you:

- **see what your app really sends**: the prompts, system messages, tool schemas and parameters your SDK, framework or agent builds, without spending tokens to find out
- **watch your error handling work**: [chaos mode](/guide/delay-and-chaos#chaos-mode-error-simulation) 429s, broken streams and dropped connections show up in LLMSpy as failed calls, next to your app's retries
- **check an agent loop turn by turn**: with [tool-call rules](/guide/response-rules#tool-calls-claude-content), each turn of a Claude tool loop is a call in LLMSpy, and its Compare tab shows what your agent added between turns
- **try LLMSpy itself** with realistic traffic before you point it at a paid API

LLMSpy reads conversations in the Anthropic Messages and OpenAI Chat Completions formats, so it suits the `claude`, `chatgpt` and `streaming` presets. Calls to the `gemini` preset or a custom template are still captured, and shown in LLMSpy's Raw view.

## Setting it up

You need Node.js 26 or later for LLMSpy (`node --version`). These steps were tested with LLMSpy 0.6.0.

1. Start LLMock with `--llmspy`. Run one server per format you want, each on its own port:

   ```bash
   llmock start --model=claude --llmspy                 # Anthropic Messages API on port 8001
   llmock start --model=chatgpt --port=8002 --llmspy    # OpenAI Chat Completions on port 8002
   ```

   In a [scaffolded project](/guide/installation#option-1-scaffolded-project-recommended), use `npx llmock` in place of `llmock`.

   `--llmspy` changes nothing about the server. It prints how to use it through LLMSpy:

   ```
   To see its calls in LLMSpy, start LLMSpy with this upstream:
     LLMSPY_UPSTREAMS=llmock-claude=http://127.0.0.1:8001
   and give your app the base URL http://127.0.0.1:8080/llmock-claude
   (the endpoint through LLMSpy is http://127.0.0.1:8080/llmock-claude/v1/messages)
   ```

   The upstream's name is `llmock-` and the preset's name, with the port added when it is not 8001 (`llmock-chatgpt-8002`), so each server gets its own. The dashboard's **Connect** card shows the same two values. If LLMSpy runs somewhere other than `http://127.0.0.1:8080`, give its address: `--llmspy=http://127.0.0.1:9090`. To have it on every start, set `"llmspy": true` (or the address) in the config file's `server` block.

2. Start LLMSpy with the LLMock servers as upstreams. `LLMSPY_UPSTREAMS` is a comma-separated list of `name=url`, so join the entries the servers printed. Each name becomes a path prefix on LLMSpy, and the rest of the request path is added to the URL:

   ```bash
   LLMSPY_UPSTREAMS=llmock-claude=http://127.0.0.1:8001,llmock-chatgpt-8002=http://127.0.0.1:8002 npx llmspy
   ```

   In PowerShell:

   ```powershell
   $env:LLMSPY_UPSTREAMS = "llmock-claude=http://127.0.0.1:8001,llmock-chatgpt-8002=http://127.0.0.1:8002"
   npx llmspy
   ```

   LLMSpy prints each upstream and its base URL when it starts. To keep the setting, put the same line in `~/.llmspy/.env`.

3. Open LLMSpy at `http://127.0.0.1:8080`, and LLMock's own dashboard at `http://localhost:8001` (and `:8002`). Both show each call: LLMSpy shows what your app sent and got back, and LLMock's dashboard shows how the mock chose its reply.

Stop them with `npx llmspy stop`, then `llmock stop` and `llmock stop --port=8002`.

## Pointing your app at it

Set your app's base URL to the one `--llmspy` printed: LLMSpy, the upstream's name, then any part of the preset's endpoint the SDK does not add itself. Mocked calls need no real key, but most SDKs want one set, so use any non-empty value:

| LLMock preset | Upstream entry | Your app's base URL |
|---|---|---|
| `claude` | `llmock-claude=http://127.0.0.1:8001` | `http://127.0.0.1:8080/llmock-claude` |
| `chatgpt` / `streaming` | `llmock-chatgpt-8002=http://127.0.0.1:8002` | `http://127.0.0.1:8080/llmock-chatgpt-8002/chatgpt` |

The upstream is the whole server, so its other routes work through LLMSpy too, such as `http://127.0.0.1:8080/llmock-chatgpt-8002/v1/embeddings`. A preset in a format with no SDK path to leave off (`gemini`, custom templates) is called at the full endpoint URL `--llmspy` prints.

Many SDKs and tools read the base URL from an environment variable:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8080/llmock-claude ANTHROPIC_API_KEY=mock node my-agent.js
OPENAI_BASE_URL=http://127.0.0.1:8080/llmock-chatgpt-8002/chatgpt OPENAI_API_KEY=mock node my-app.js
```

Or in code:

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: 'mock', baseURL: 'http://127.0.0.1:8080/llmock-claude' });
const reply = await client.messages.create({
  model: 'claude-opus-5-5',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello' }],
});
```

Or with curl:

```bash
curl http://127.0.0.1:8080/llmock-claude/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: mock" \
  -d '{"model": "claude-opus-5-5", "max_tokens": 256, "messages": [{"role": "user", "content": "Hello"}]}'
```

To switch the app to the real API, change only the base URL: to LLMSpy's built-in `http://127.0.0.1:8080/anthropic` or `http://127.0.0.1:8080/openai` to keep watching the calls, or back to the provider's own URL.

If you run several apps, LLMSpy can give each its own tab: put `@<project>/` before the upstream name, as in `http://127.0.0.1:8080/@my-agent/llmock-claude`. See LLMSpy's README for more.

## Matching a call in LLMSpy to LLMock

Every LLMock reply carries an `x-llmock-request-id` header, streamed ones included, and the [request log](/guide/dashboard-and-logging#request-logging) entry for that request has the same id as `request_id`. Open the call in LLMSpy's Raw view, read the id from the response headers, and find the entry with that id in LLMock's request log, which shows whether the request passed validation and why. This is most use when several LLMock servers run at once, since they all write to one log.

## Things to try

Each of these is a normal LLMock setting. LLMSpy shows the result:

| To see in LLMSpy | LLMock setting |
|---|---|
| A streamed reply, put back together | Send `"stream": true` |
| A reply cut off at the token limit, or a refusal | A response rule with `stopReason` (see [Truncated and refused replies](/guide/response-rules#truncated-and-refused-replies-stopreason)) |
| A Claude tool call and its result in the next turn | A response rule with `content` (see [Tool calls](/guide/response-rules#tool-calls-claude-content)) |
| A 429 with `retry-after`, under LLMSpy's **Failed** chip | `llmock start --model=claude --chaos=true --chaosFrequency=3 --chaosStatus=429` |
| A stream that breaks part-way through | `--chaos=true --chaosKind=stream-error` (or `stream-drop`), and send `"stream": true` |
| Slow calls, in LLMSpy's latency cards | `--delayMin=500 --delayMax=3000` |
| One failing prompt among working ones | A response rule with `fail` (see [Failing one prompt](/guide/response-rules#failing-one-prompt-fail)) |

Chaos errors carry the `x-llmock-chaos: true` header, which LLMSpy shows in the Raw view, so a mocked failure is easy to tell from a real one.

To change these while both are running, use LLMock's [admin API](/reference/admin-api#admin-api-changing-rules-and-settings-while-running). There is no need to restart either server.

## With Docker

If LLMSpy runs in Docker (`npm run start:docker` in a clone of LLMSpy), `localhost` inside its container is the container itself. Point the upstreams at your machine instead, in LLMSpy's `.env`:

```
LLMSPY_UPSTREAMS=llmock-claude=http://host.docker.internal:8001,llmock-chatgpt-8002=http://host.docker.internal:8002
```

The app's base URLs stay as above. `--llmspy` prints `127.0.0.1` in the upstream, which is right for an LLMSpy running directly on your machine, so change it to `host.docker.internal` here.

This works as it is with Docker Desktop. On Linux, `host.docker.internal` does not reach a port bound only to `127.0.0.1`. LLMock listens on every interface by default, so it can be reached there, unless you have [set `host`](/reference/admin-api#network-exposure) to `127.0.0.1`. If LLMock runs in Docker too, either publish its port and use `host.docker.internal:<port>`, or put both containers on one Docker network and use the LLMock container's name.
