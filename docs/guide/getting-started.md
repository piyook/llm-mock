# Getting started

LLMock is a local server that answers like an LLM API: OpenAI chat completions and Responses, Gemini, or the Anthropic Messages API. Point your app's SDK at it and you get realistic replies with no API key, no cost and no network.

This page takes about five minutes: create a project, start the server, send it a request.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or later (26 LTS recommended; it is the version LLMock is tested on)
- A terminal, and `curl` or an LLM SDK to send requests with

## Create a project

The scaffolding tool creates a project with a config file, editable templates and a Docker setup:

```bash
npm create llmock@latest my-project
cd my-project
npm install
```

::: tip Already have a project?
Add LLMock to it with `npm install llmock` and use `npx llmock start` in place of the `npm run` scripts on this page. See [Installation](/guide/installation) for that, and for Docker.
:::

### File structure

```
my-project/
├── .llmockrc.json          # presets: which API to mimic, delays, chaos, rules
├── request-templates/      # what a valid request looks like, per provider
├── response-templates/     # the shape of each provider's reply
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

`.llmockrc.json` is the file you will edit most. It is described in [Configuration](/guide/configuration).

## Up and running

Start the server with the preset for the API your app calls:

::: code-group

```bash [OpenAI]
npm run llmock:chatgpt
```

```bash [Anthropic]
npm run llmock:claude
```

```bash [Gemini]
npm run llmock:gemini
```

```bash [Streaming]
npm run llmock:streaming    # OpenAI-style, streams by default
```

```bash [Embeddings]
npm run llmock:embeddings
```

:::

The server runs in the background on port `8001`. Open `http://localhost:8001` in your browser to see the live dashboard: the preset in use, its settings, and every request as it arrives.

## Send a request

Point your SDK at LLMock in place of the real API. Any API key will do.

::: code-group

```bash [curl]
curl http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hello"}]}'
```

```ts [OpenAI SDK]
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: 'mock', baseURL: 'http://localhost:8001/chatgpt' });
const reply = await client.chat.completions.create({
	model: 'gpt-4o-mini',
	messages: [{ role: 'user', content: 'Hello' }],
});
console.log(reply.choices[0].message.content);
```

```ts [Anthropic SDK]
// Start the server with: npm run llmock:claude
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: 'mock', baseURL: 'http://localhost:8001' });
const reply = await client.messages.create({
	model: 'claude-opus-5-5',
	max_tokens: 1024,
	messages: [{ role: 'user', content: 'Hello' }],
});
console.log(reply.content);
```

:::

The reply has the real API's shape, with generated text in it. The request shows up on the dashboard.

::: info Want a specific reply?
Generated text is the default. To answer a chosen prompt with your own text, JSON or a tool call, add a [response rule](/guide/response-rules).
:::

## Stop the server

```bash
npm run llmock:stop
```

## What's next?

Pick what you want to do:

- **Return a fixed reply for a given prompt**: [Response rules](/guide/response-rules)
- **Use real replies, offline**: [Recording real replies](/guide/recording)
- **Test retries and error handling**: [Delays and chaos mode](/guide/delay-and-chaos)
- **Start a server from your tests and check what your code sent**: [Using LLMock in tests](/guide/testing-from-code)
- **Change replies while it runs**: [Admin API](/reference/admin-api)
- **Connect LangChain, embeddings or the Responses API**: [Integration](/guide/integration)
- **Run it in Docker or CI**: [Docker](/guide/docker)

When you want the details, every CLI option is in the [CLI reference](/reference/cli) and every config key in [Configuration](/guide/configuration). If something isn't working, see [Troubleshooting](/troubleshooting).
