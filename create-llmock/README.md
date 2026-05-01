# create-llmock

Scaffolding tool for LLMock projects.

## Usage

```bash
npm create llmock@latest my-project
# or
npx create-llmock my-project
```

## What's Included

- **llmock** — Core package
- **`.llmockrc.json`** — Configuration with sensible defaults
- **Example files** — Sample requests/responses for OpenAI and Gemini APIs
- **npm scripts** — For starting, stopping, and running the server
- **README** — Setup instructions for the generated project

## Project Structure

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

## Scripts

| Script | Description |
|---|---|
| `npm run llmock:start` | Start the server |
| `npm run llmock:stop` | Stop the server |
| `npm run llmock:chatgpt` | Run with ChatGPT model |
| `npm run llmock:gemini` | Run with Gemini model |
| `npm run llmock:streaming` | Run with streaming responses |
| `npm run llmock:embeddings` | Run with embeddings model |

## Docker (Optional)

Requires Docker and Docker Compose.

```bash
npm run docker:start    # Start container (detached)
npm run docker:stop     # Stop container and remove volumes
npm run docker:rebuild  # Rebuild and restart
npm run docker:restart  # Stop and start
```

The server runs at `http://localhost:8001`. The container mounts `.llmockrc.json`, runs as a non-root user, and includes health checks.

---

Part of the [LLMock ecosystem](https://github.com/piyook/llm-mock). See this [README](https://github.com/piyook/llm-mock#readme) for more information.
