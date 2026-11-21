# Installation

There are three ways to run LLMock. If you are not sure which to use, take the first: it is what [Getting started](/guide/getting-started) uses.

## Option 1: Scaffolded project (recommended)

```bash
npm create llmock@latest my-project
```

Generates a ready-to-use project with configuration, templates, and Docker support.

### Scaffolded project layout

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

The template folders contain editable copies of the built-in OpenAI, Gemini and Claude templates. The server uses them for request validation and response shape. To add your own provider, see [Template locations](/guide/providers#template-locations).

## Option 2: Add to an existing project

```bash
npm install llmock
# or globally
npm install -g llmock
```

Then use the CLI directly:

```bash
llmock start                        # uses defaultModel from .llmockrc.json (chatgpt if none), port 8001
llmock start --model=gemini
llmock start --model=claude         # Anthropic Messages API
llmock start --port=3000 --stream=true
llmock start --port=0               # any free port; the port is printed
llmock stop                         # add --port=3000 if not on 8001
llmock config                       # show current settings (accepts --model)
llmock help
```

`start` is the default command, so `llmock --model=claude` works too. Every command and option is in the [CLI reference](/reference/cli).

## Option 3: Docker

```bash
npm create llmock@latest my-project
cd my-project
npm run docker:start
```

See [Docker Support](/guide/docker#docker-support) for full details, including how to run LLMock in Docker from your own project without the scaffolding.

## Foreground mode

For Docker containers or when you want the server to stay attached to your terminal:

```bash
llmock start --foreground
```

The `--foreground` flag keeps the server process attached and forwards all output to your console. This is essential for Docker containers and useful for debugging. Without this flag, the server runs as a detached background process.

On Windows the background server starts without opening a console window. Use `llmock stop` to shut it down, or `llmock start --foreground` to keep it visible in your terminal.

## Network exposure

LLMock has no authentication, and by default it listens on every network interface (`"host": "0.0.0.0"`). Anyone who can reach the port can change the replies through the [admin API](/reference/admin-api), read the calls it recorded (`GET /admin/requests`), and read or clear the [request log](/guide/dashboard-and-logging#request-logging). Both hold the prompts your app sent. Turning the admin API off does not cover the request log.

For a mock server running locally with test data this is not usually a problem. If you want to take extra precautions, you can keep the mock to your own machine:

- Run directly: set `"host": "127.0.0.1"` in the `server` block, or start with `--host=127.0.0.1`.
- Run in Docker: leave `"host": "0.0.0.0"` in the config, which the container needs, and publish the port on the loopback address only, as `"127.0.0.1:8001:8001"`. The [Docker example](/guide/docker#standalone-docker-setup-no-scaffolding) does this. Other containers in the same compose file still reach the mock by its service name.
