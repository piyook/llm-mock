# LLMock — Local Mock LLM API

[![GitHub Release](https://img.shields.io/github/v/release/piyook/llm-mock)](https://github.com/piyook/llm-mock/releases)
[![tests workflow](https://github.com/piyook/llm-mock/actions/workflows/tests.yaml/badge.svg)](https://github.com/piyook/llm-mock/actions/workflows/tests.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/llmock)](https://www.npmjs.com/package/llmock)

A lightweight local server that simulates LLM APIs for development and testing. Build and test AI-powered applications without API costs or an internet connection.

---

## Table of Contents

- [Why LLMock?](#why-llmock)
- [Quick Start](#quick-start)
- [Installation Options](#installation-options)
- [Configuration](#configuration)
- [Features](#features)
- [Integration Guide](#integration-guide)
- [Supporting Different LLM Providers](#supporting-different-llm-providers)
- [Docker Support](#docker-support)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why LLMock?

- **Free and fast** — no API costs, instant responses for rapid prototyping
- **Simple and lightweight** — easier to set up than a local model and uses far fewer system resources
- **Consistent testing** — predictable, repeatable responses for testing UI logic
- **Offline capable** — works without internet connectivity
- **Full visibility** — complete request logging and a live dashboard
- **Realistic simulation** — configurable delays, SSE streaming, and mock embeddings
- **OpenAI-compatible** — works with ChatGPT, Grok, Llama, DeepSeek, Gemini, and any OpenAI-style API

Built on [Fastify](https://www.fastify.io/) for high performance and reliability.

---

## Quick Start

**Prerequisites:** Node.js 20+

The fastest way to get started is with the scaffolding tool, which creates a complete project with configuration files and example templates:

```bash
npm create llmock@latest my-project
cd my-project
npm install
npm run llmock:start
```

Open `http://localhost:8001` to see the live dashboard.

That's it. To run against a specific model preset:

```bash
npm run llmock:chatgpt      # OpenAI ChatGPT-style (default)
npm run llmock:gemini       # Google Gemini format
npm run llmock:streaming    # OpenAI-style with SSE streaming
npm run llmock:embeddings   # Optimised for embeddings/RAG testing
```

### Scaffolded project layout

```
my-project/
├── package.json
├── .llmockrc.json
├── README.md
├── requests/
│   ├── openai-chat.json
│   └── gemini-chat.json
└── responses/
    ├── openai-chat-response.json
    └── gemini-chat-response.json
```

---

## Installation Options

### Option 1: Scaffolded project (recommended)

```bash
npm create llmock@latest my-project
```

Generates a ready-to-use project with configuration, templates, and Docker support.

### Option 2: Add to an existing project

```bash
npm install llmock
# or globally
npm install -g llmock
```

Then use the CLI directly:

```bash
llmock start                        # default: ChatGPT model, port 8001
llmock start --model=gemini
llmock start --port=3000 --stream=true
llmock stop
llmock config                       # show current settings
llmock help
```

All CLI flags support both `--key=value` and `--key value` formats and override `.llmockrc.json` at runtime.

### Foreground Mode

For Docker containers or when you want the server to stay attached to your terminal:

```bash
llmock start --foreground
```

The `--foreground` flag keeps the server process attached and forwards all output to your console. This is essential for Docker containers and useful for debugging. Without this flag, the server runs as a detached background process.

**Windows users:** In normal mode, the server may create a minimized terminal window. This is expected behavior for background processes on Windows. Use `llmock start --foreground` if you want to keep the server visible in your terminal.

### Option 3: Docker

```bash
npm create llmock@latest my-project
cd my-project
npm run docker:start
```

See [Docker Support](#docker-support) for full details.

---

## Configuration

### Configuration file (`.llmockrc.json`)

All settings live in `.llmockrc.json` in your project root. CLI flags always override these values.

```json
{
  "defaultModel": "chatgpt",
  "models": {
    "chatgpt": {
      "name": "openai",
      "model": "gpt-4o",
      "endpoint": "chatgpt/chat/completions",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "logRequests": true,
      "debug": false,
      "stream": false,
      "responseDelay": {
        "min": 3000,
        "max": 5000
      },
      "embeddings": {
        "enabled": true,
        "dimensions": 128
      }
    }
  },
  "server": {
    "port": 8001,
    "host": "0.0.0.0"
  }
}
```

**Configuration reference:**

| Option | Description |
|---|---|
| `name` | LLM provider name (used for template loading) |
| `model` | Model identifier (e.g. `gpt-4o`, `gemini-pro`) |
| `endpoint` | API endpoint path |
| `responseType` | `"lorem"` (random text) or `"stored"` (predefined responses) |
| `maxLoremParas` | Max sentences in lorem ipsum responses |
| `validateRequests` | Validate incoming requests against templates |
| `logRequests` | Save requests to the log file |
| `debug` | Enable verbose console logging |
| `stream` | Return SSE streaming responses |
| `responseDelay.min/max` | Response delay range in milliseconds |
| `embeddings.enabled` | Enable the `/v1/embeddings` endpoint |
| `embeddings.dimensions` | Embedding vector size |

### Adding custom models

Extend the `models` object with any additional preset, then start with `--model=<name>`:

```json
{
  "models": {
    "my-model": {
      "name": "openai",
      "model": "gpt-3.5-turbo",
      "endpoint": "api/v1/chat/completions",
      "responseType": "stored",
      "validateRequests": true,
      "logRequests": false,
      "debug": true,
      "stream": false,
      "responseDelay": { "min": 1000, "max": 2000 },
      "embeddings": { "enabled": false, "dimensions": 64 }
    }
  }
}
```

```bash
llmock start --model=my-model
```

### Response types

**Lorem ipsum** — generates random placeholder text, good for testing variable-length content in the UI:

```json
{ "responseType": "lorem", "maxLoremParas": 8 }
```

**Stored responses** — returns predefined answers from `src/data/data.json`, useful for domain-specific or reproducible testing. The server randomly selects from this list on each request:

```json
{
  "responseType": "stored"
}
```

```json
{
  "responses": [
    "This is a custom response for testing.",
    "Another predefined response for consistency."
  ]
}
```

### Streaming responses

Enable OpenAI-style Server-Sent Events (SSE) streaming in your config or via CLI:

```json
{ "stream": true }
```

```bash
llmock start --stream=true
```

When enabled, the endpoint returns a chunked SSE stream. The first few chunks arrive immediately (mimicking real LLM behaviour), with subsequent chunks following the configured delay.

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-124","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: [DONE]
```

### Response delay simulation

Simulate realistic API latency to test loading states, timeout handling, and UX:

```json
{
  "responseDelay": { "min": 800, "max": 2500 }
}
```

Set both values to `0` for instant responses. The server picks a random value in the range for each request.

| Profile | min | max |
|---|---|---|
| Instant (development) | 0 | 0 |
| Fast | 100 | 300 |
| Realistic production | 800 | 2500 |
| Slow / timeout testing | 3000 | 8000 |
| Fixed delay | 1000 | 1000 |

### Custom API paths

Set the endpoint to match any provider's path structure:

```json
{ "endpoint": "chatgpt/chat/completions" }
// → http://localhost:8001/chatgpt/chat/completions

{ "endpoint": "models/gemini-pro:generateContent" }
// → http://localhost:8001/models/gemini-pro:generateContent
```

### Environment variables

For CI/CD pipelines, set these to switch between mock and production:

```bash
TEST_MODE=true
TEST_BASE_URL=http://localhost:8001/chatgpt
TEST_EMBEDDING_URL=http://localhost:8001/v1/embeddings
```

Setting `TEST_MODE=false` switches back to real LLM services.

---

## Features

### Dashboard

Once running, open `http://localhost:8001` for the live dashboard:

![LLM Mock Server Page](images/server-page.png)

| URL | Purpose |
|---|---|
| `http://localhost:8001` | Main dashboard |
| `http://localhost:8001/logs` | Request log history |
| `http://localhost:8001/ping` | Health check |

The dashboard shows server status, current configuration, available endpoints, and recent request logs. It refreshes automatically every 2 seconds.

### Available endpoints

| Endpoint | Description |
|---|---|
| Configurable (default: `/chatgpt/chat/completions`) | Chat completions |
| `/v1/embeddings` | OpenAI-compatible mock embeddings |

### Request validation

Validate incoming requests against templates to confirm API compatibility:

1. Add a template to the `request-templates/` folder
2. Enable validation: `"validateRequests": true`

Invalid requests return a detailed error describing the mismatch.

### Request logging

Enable with `"logRequests": true` and view at `http://localhost:8001/logs`, or find the log file at:

| Platform | Log location |
|---|---|
| Windows | `C:\Users\{name}\AppData\Local\llmock-nodejs\Log\` |
| macOS | `~/Library/Logs/llmock-nodejs/` |
| Linux | `~/.local/share/llmock-nodejs/log/` |

### Debug mode

Enable verbose console output to see incoming request details, validation results, response generation steps, and timing:

```bash
llmock start --debug=true
```

---

## Integration Guide

### Chat completions

#### Standard (non-streaming)

```bash
curl http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 1,
    "stream": false
  }'
```

```json
{
  "id": "chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe",
  "object": "chat.completion",
  "created": 1678485525,
  "model": "gpt-3.5-turbo-0301",
  "choices": [{"message": {"role": "assistant", "content": "Generated response"}}]
}
```

#### Streaming

Enable `stream: true` in your config, then use the same endpoint:

```bash
curl -N http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

### Embeddings API

The mock server provides an OpenAI-compatible embeddings endpoint at `/v1/embeddings`:

```bash
curl http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Your text string goes here"
  }'
```

Pass an array of strings for multiple embeddings in one call:

```bash
-d '{"model": "text-embedding-ada-002", "input": ["First text", "Second text"]}'
```

**Response format:**

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.1234, -0.5678, 0.9012]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": { "prompt_tokens": 6, "total_tokens": 6 }
}
```

Key characteristics of mock embeddings: deterministic (same input always returns the same vector), configurable dimensions, model-name-sensitive, and OpenAI-compatible in shape. Note that vectors are pseudo-random — they have the correct shape for testing but are not real semantic embeddings.

### Using with LangChain

Point your `ChatOpenAI` client at the mock server when `TEST_MODE` is enabled:

```javascript
import { ChatOpenAI } from '@langchain/openai';

const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  configuration:
    process.env.TEST_MODE === 'true'
      ? { baseURL: process.env.TEST_BASE_URL } // http://localhost:8001/chatgpt
      : {},
});
```

For embeddings, use LangChain's built-in fake embeddings or call the mock endpoint directly:

```javascript
class MockEmbeddingsAPI {
  async embedDocuments(texts) {
    return Promise.all(texts.map(text => this.embedQuery(text)));
  }

  async embedQuery(text) {
    const response = await fetch(process.env.TEST_EMBEDDING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: 'text-embedding-ada-002' }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  }
}

const embeddings =
  process.env.TEST_MODE === 'true'
    ? new MockEmbeddingsAPI()
    : new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY });
```

---

## Supporting Different LLM Providers

LLMock supports any provider that uses the OpenAI chat completion format: ChatGPT, Grok, Llama, DeepSeek, Mistral, Claude, Gemini, and more. For providers with different request/response shapes, create custom templates.

### Template locations

The framework checks two locations, in priority order:

1. `./request-templates/` and `./response-templates/` in your project root
2. `src/request-templates/` and `src/response-templates/` in the package source

Project-level templates take priority, so you can add custom templates without modifying the package.

### Creating a custom provider template

**Step 1 — Request template** (`request-templates/<LLM_NAME>_req.json`):

```json
{
  "model": "string",
  "messages": [
    { "role": "string", "content": "string" }
  ]
}
```

**Step 2 — Response template** (`response-templates/<LLM_NAME>_res.json`):

Use `DYNAMIC_CONTENT_HERE` as the placeholder for generated content:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "DYNAMIC_CONTENT_HERE"
      },
      "finish_reason": "stop"
    }
  ]
}
```

**Step 3 — Model preset** (`.llmockrc.json`):

The `name` field must match your template filename prefix:

```json
{
  "models": {
    "mymodel": {
      "name": "mymodel",
      "model": "my-custom-model-v1",
      "endpoint": "api/v1/chat/completions",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "stream": false,
      "responseDelay": { "min": 1000, "max": 2000 },
      "embeddings": { "enabled": true, "dimensions": 128 }
    }
  }
}
```

**Step 4 — Start and test:**

```bash
llmock start --model=mymodel

curl http://localhost:8001/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "my-custom-model-v1", "messages": [{"role": "user", "content": "Hello"}]}'
```

---

## Docker Support

Docker is included when you use the scaffolding tool and is useful for CI/CD pipelines and consistent team environments.

### Available scripts

| Script | Description |
|---|---|
| `npm run docker:start` | Start the container in detached mode |
| `npm run docker:stop` | Stop the container and remove volumes |
| `npm run docker:rebuild` | Rebuild and restart the container |
| `npm run docker:restart` | Stop and start the container |

### Configuration

The Docker container uses the same `.llmockrc.json` as the local setup, mounted as a read-only volume. Update settings and restart to apply changes — no rebuild required:

```bash
vim .llmockrc.json
npm run docker:restart
```

### How Docker Works

The Docker container uses the `--foreground` flag to keep the LLMock server process attached. This prevents the container from restarting continuously, which would happen if the server ran as a detached background process. The container includes:

- **Dockerfile**: Multi-stage Node.js build with security best practices
- **docker-compose.yml**: Port 8001 exposed, config file mounted, health checks
- **docker-start script**: Runs `llmock start --foreground` to keep the server attached

### Manual Docker commands

```bash
docker compose up -d --force-recreate       # build and start
docker compose logs -f                      # view logs
docker compose down --volumes               # stop and clean up
docker compose down --volumes && docker compose up -d --force-recreate --build  # rebuild
```

> **Note:** LLMock is intended for local development and testing only.

---

## Troubleshooting

**Server not responding**

Confirm the server is running and the port matches `.llmockrc.json`. Open `http://localhost:8001` — if it's unreachable, the server may not have started.

![LLM Mock Server error page](images/server-page-err.png)

**Port already in use**

Change the port in `.llmockrc.json` or pass it as a flag:

```bash
llmock start --port=8002
```

**Request validation failures**

- Confirm your request template matches the provider's API format
- Check the request shape at `http://localhost:8001/logs`
- Verify the `name` field in your model config matches the template filename prefix

**Response delays not applied**

Ensure both `responseDelay.min` and `responseDelay.max` are set and greater than `0`, then restart the server.

---

## License

MIT — see [LICENSE](LICENSE) for details.
