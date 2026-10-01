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
- **Example files** — Editable request/response templates for OpenAI, Gemini and Claude APIs
- **npm scripts** — For starting, stopping, and running the server
- **Docker files** — `Dockerfile` and `docker-compose.yml` for running the server in a container
- **README** — Setup instructions for the generated project

## Project Structure

```
my-project/
├── package.json
├── .llmockrc.json
├── README.md
├── Dockerfile
├── docker-compose.yml
├── request-templates/
│   ├── openai_req.json
│   ├── gemini_req.json
│   └── claude_req.json
└── response-templates/
    ├── openai_res.json
    ├── gemini_res.json
    └── claude_res.json
```

## Scripts

| Script | Description |
|---|---|
| `npm run llmock:start` | Start the server |
| `npm run llmock:stop` | Stop the server |
| `npm run llmock:chatgpt` | Run with ChatGPT model |
| `npm run llmock:gemini` | Run with Gemini model |
| `npm run llmock:claude` | Run with Claude (Anthropic Messages API) model |
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

The server runs at `http://localhost:8001`. The container runs as a non-root user and mounts `.llmockrc.json` read-only, so a config change only needs `npm run docker:restart`.

Everything else in the project (templates, and any fixture or stored response files your config points to) is copied into the image when it is built. After changing those, run `npm run docker:rebuild`, or add a volume for them in `docker-compose.yml`.

---

Part of the [LLMock ecosystem](https://github.com/piyook/llm-mock). See this [README](https://github.com/piyook/llm-mock#readme) for more information.
