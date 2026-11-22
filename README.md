# LLMock — Local Mock LLM API

[![GitHub Release](https://img.shields.io/github/v/release/piyook/llm-mock)](https://github.com/piyook/llm-mock/releases)
[![tests workflow](https://github.com/piyook/llm-mock/actions/workflows/tests.yaml/badge.svg)](https://github.com/piyook/llm-mock/actions/workflows/tests.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/llmock)](https://www.npmjs.com/package/llmock)

A lightweight local server that simulates LLM APIs for development and testing. Point your OpenAI, Anthropic or Gemini SDK at it and build and test AI-powered applications without API costs or an internet connection.

**📖 Documentation: [llmock.piyook.com](https://llmock.piyook.com/)**

![The LLMock dashboard](https://raw.githubusercontent.com/piyook/llm-mock/main/docs/public/images/server-page.png)

## Why LLMock?

- **Free and fast**: no API costs, instant responses for rapid prototyping
- **Simple and lightweight**: easier to set up than a local model and uses far fewer system resources
- **OpenAI, Anthropic and Gemini**: chat completions and the [Responses API](https://llmock.piyook.com/guide/integration#responses-api-openai), the Anthropic Messages API with the SDK's streaming events, Gemini, and any OpenAI-style API
- **Replies you choose**: [response rules](https://llmock.piyook.com/guide/response-rules) return your own text or JSON for requests that contain a chosen string, and [Claude tool calls](https://llmock.piyook.com/guide/tool-calls) for testing an agent's tool loop
- **Record and replay**: [send unknown calls to the real provider once](https://llmock.piyook.com/guide/recording), save the replies as fixtures, replay them offline after
- **Intermittent errors**: [chaos mode](https://llmock.piyook.com/guide/chaos) fails every call or 1 in X calls with a 429, 500 or any other status, or breaks a stream part-way through, to test retries and error handling
- **Made for tests**: [start a server from your test](https://llmock.piyook.com/guide/testing-from-code), change replies while it runs, and check exactly what your code sent
- **Full visibility**: a live [dashboard and request log](https://llmock.piyook.com/guide/dashboard-and-logging)
- **Realistic simulation**: configurable [delays](https://llmock.piyook.com/guide/delays), SSE [streaming](https://llmock.piyook.com/guide/streaming), and mock [embeddings](https://llmock.piyook.com/guide/integration#embeddings-api)
- **Works with [LLMSpy](https://github.com/piyook/llmspy)**: put LLMSpy in front of LLMock to see every mocked call as a conversation, with no API key ([how](https://llmock.piyook.com/guide/llmspy))

Built on [Fastify](https://www.fastify.io/).

## Quick start

**Prerequisites:** Node.js 24 or later (26 LTS recommended; it is the version LLMock is tested on)

```bash
npm create llmock@latest my-project
cd my-project
npm install
npm run llmock:start
```

Open `http://localhost:8001` to see the live dashboard. To run a specific provider's preset:

```bash
npm run llmock:chatgpt      # OpenAI ChatGPT-style (default)
npm run llmock:gemini       # Google Gemini format
npm run llmock:claude       # Anthropic Claude Messages API (/v1/messages)
npm run llmock:streaming    # OpenAI-style with SSE streaming
npm run llmock:embeddings   # Optimised for embeddings/RAG testing
```

To add LLMock to an existing project (`npm install llmock`) or run it in Docker, see [Installation](https://llmock.piyook.com/guide/installation).

## Send a request

Point your SDK at LLMock in place of the real API. Any API key will do.

```ts
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: 'mock', baseURL: 'http://localhost:8001/chatgpt' });
const reply = await client.chat.completions.create({
	model: 'gpt-4o-mini',
	messages: [{ role: 'user', content: 'Hello' }],
});
```

With the `claude` preset, the Anthropic SDK takes `baseURL: 'http://localhost:8001'`. The [Getting started](https://llmock.piyook.com/guide/getting-started) guide walks through it, with curl and the Anthropic SDK too.

## Documentation

| | |
|---|---|
| **Start here** | [Getting started](https://llmock.piyook.com/guide/getting-started) · [Installation](https://llmock.piyook.com/guide/installation) · [Configuration](https://llmock.piyook.com/guide/configuration) |
| **Control the replies** | [Response rules](https://llmock.piyook.com/guide/response-rules) · [Tool calls (Claude)](https://llmock.piyook.com/guide/tool-calls) · [Truncated and refused replies](https://llmock.piyook.com/guide/stop-reasons) · [Generated and stored replies](https://llmock.piyook.com/guide/response-types) · [Recording real replies](https://llmock.piyook.com/guide/recording) · [Streaming](https://llmock.piyook.com/guide/streaming) |
| **Test failures** | [Chaos mode](https://llmock.piyook.com/guide/chaos) · [Failing one prompt](https://llmock.piyook.com/guide/failing-a-prompt) · [Response delays](https://llmock.piyook.com/guide/delays) |
| **Connect your app** | [Integration](https://llmock.piyook.com/guide/integration) · [LLM providers](https://llmock.piyook.com/guide/providers) · [Using LLMock in tests](https://llmock.piyook.com/guide/testing-from-code) · [Using with LLMSpy](https://llmock.piyook.com/guide/llmspy) · [Docker](https://llmock.piyook.com/guide/docker) |
| **Reference** | [CLI](https://llmock.piyook.com/reference/cli) · [Config file](https://llmock.piyook.com/reference/config) · [Admin API](https://llmock.piyook.com/reference/admin-api) |
| **Help** | [Troubleshooting](https://llmock.piyook.com/troubleshooting) · [Releases](https://github.com/piyook/llm-mock/releases) |

> **Using a coding agent?** Point it at [`llms.txt`](llms.txt) (shipped in the npm package at `node_modules/llmock/llms.txt`): a compact reference to the CLI, config schema, response shapes and gotchas.

> **Note:** LLMock has no authentication and by default listens on every network interface. For a local mock server this is not usually a problem, but if you want to take extra precautions you can keep it to your own machine. See [Network exposure](https://llmock.piyook.com/guide/installation#network-exposure).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE) for details.
