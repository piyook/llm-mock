# Configuration

All settings live in `.llmockrc.json` in your project root. A scaffolded project has one already; with no file, LLMock uses its built-in presets.

## Presets

The file holds named **presets** under `models`. Each preset says which API to mimic (`name`), where to serve it (`endpoint`) and how to reply. `defaultModel` names the preset used when you don't pass `--model`:

```json
{
  "defaultModel": "chatgpt",
  "models": {
    "chatgpt": {
      "name": "openai",
      "model": "gpt-4o",
      "endpoint": "chatgpt/chat/completions",
      "responseDelay": { "min": 800, "max": 2500 }
    },
    "claude": {
      "name": "claude",
      "model": "claude-opus-5-5",
      "endpoint": "v1/messages"
    }
  },
  "server": { "port": 8001 }
}
```

```bash
llmock start                  # the defaultModel preset
llmock start --model=claude   # another preset
```

Only `name` and `endpoint` are required in a preset; everything else has a default. Every key, with its default, is in the [config file reference](/reference/config).

## When changes apply

- The config file is read once at startup, so restart the server after changing it.
- Fixture files and the stored responses file are read on every request, so edits to those apply straight away.
- CLI flags override the file for one run (see the [CLI reference](/reference/cli)).
- The [admin API](/reference/admin-api) changes rules, chaos, delay and reply settings on the running server, with no restart.

## Adding custom models

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

To mimic a provider LLMock does not have a template for, see [Creating a custom provider template](/guide/providers#creating-a-custom-provider-template).

## Custom API paths

Set the endpoint to match any provider's path structure:

| `endpoint` | URL |
|---|---|
| `chatgpt/chat/completions` | `http://localhost:8001/chatgpt/chat/completions` |
| `models/gemini-pro:generateContent` | `http://localhost:8001/models/gemini-pro:generateContent` |

Write the path without a leading slash.

## Environment variables

LLMock does not read any of these itself. They are a suggested convention for your own app, so it can switch between the mock and the real provider (the [LangChain example](/guide/integration#using-with-langchain) uses them):

```bash
TEST_MODE=true
TEST_BASE_URL=http://localhost:8001/chatgpt
TEST_EMBEDDING_URL=http://localhost:8001/v1/embeddings
```

With `TEST_MODE=false` your app talks to the real LLM service again.
