# {{PROJECT_NAME}}

This project uses LLMock to provide mock LLM API responses for testing and development.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the mock server:
   ```bash
   npm run llmock:start
   ```

3. Stop the server:
   ```bash
   npm run llmock:stop
   ```

## Available Scripts

- `npm run llmock:start` - Start the LLMock server
- `npm run llmock:stop` - Stop the LLMock server
- `npm run llmock:chatgpt` - Run with ChatGPT model
- `npm run llmock:gemini` - Run with Gemini model
- `npm run llmock:claude` - Run with Claude (Anthropic Messages API) model
- `npm run llmock:streaming` - Run with streaming responses
- `npm run llmock:embeddings` - Run with embeddings model

## Configuration

The server configuration is in `.llmockrc.json`. You can modify:

- Server host and port
- Logging settings
- Response delays
- Chaos mode (`chaos`): fail 1 in X calls to test retries and error handling, with an HTTP error or, with `kind`, a stream that errors, is cut or stalls part-way through
- Endpoint paths

## Customizing Responses

### Requests
Request templates live in `request-templates/` and are named `<name>_req.json`. When `validateRequests` is on, incoming requests are checked against the template for the active preset.

### Responses
Response templates live in `response-templates/` and are named `<name>_res.json`. The placeholder `DYNAMIC_CONTENT_HERE` is replaced with the generated reply.

### Example Files

The project includes editable templates for:
- OpenAI ChatGPT (`openai_req.json` / `openai_res.json`)
- Google Gemini (`gemini_req.json` / `gemini_res.json`)
- Anthropic Claude (`claude_req.json` / `claude_res.json`)

## Server Endpoints

Once started, the server will be available at:
- Dashboard: `http://localhost:8001`
- OpenAI compatible (`chatgpt`, `streaming`): `http://localhost:8001/chatgpt/chat/completions`
- Gemini compatible (`gemini`): `http://localhost:8001/models/gemini-pro:generateContent`
- Anthropic Messages (`claude`): `http://localhost:8001/v1/messages`
- Embeddings: `http://localhost:8001/v1/embeddings`

One preset runs at a time; the chat endpoint is the one for the preset you started.

## Coding agents

`node_modules/llmock/llms.txt` is a compact reference to the CLI, config schema, response shapes and limits, written for coding agents.

## Development

For more information about LLMock, visit the main repository: https://github.com/piyook/llm-mock
