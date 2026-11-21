# Docker Support

Docker is included when you use the scaffolding tool and is useful for CI/CD pipelines and consistent team environments.

## Available scripts

| Script | Description |
|---|---|
| `npm run docker:start` | Start the container in detached mode |
| `npm run docker:stop` | Stop the container and remove volumes |
| `npm run docker:rebuild` | Rebuild and restart the container |
| `npm run docker:restart` | Stop and start the container |

## Configuration

The Docker container uses the same `.llmockrc.json` as the local setup, mounted as a read-only volume. Update settings and restart to apply changes — no rebuild required:

```bash
vim .llmockrc.json
npm run docker:restart
```

## How Docker Works

The Docker container uses the `--foreground` flag to keep the LLMock server process attached. This prevents the container from restarting continuously, which would happen if the server ran as a detached background process. The container includes:

- **Dockerfile**: Node 26 Alpine image that runs the server as a non-root user
- **docker-compose.yml**: Port 8001 exposed, config file mounted read-only
- **docker-start script**: Runs `llmock start --foreground` to keep the server attached

## Standalone Docker setup (no scaffolding)

You don't need `create-llmock` to run LLMock in Docker. The published `llmock` package can run from a small Dockerfile inside your own project, so only your config and fixtures live in your repo.

```
your-project/
└── docker/
    └── llmock/
        ├── Dockerfile
        ├── docker-compose.yml
        ├── .llmockrc.json
        └── fixtures/
            └── summary.json
```

**Dockerfile**

```dockerfile
FROM node:26-alpine
WORKDIR /app
RUN npm install --omit=dev llmock
EXPOSE 8001
CMD ["npx", "llmock", "start", "--foreground"]
```

**docker-compose.yml**

```yaml
services:
  llmock:
    build: .
    ports:
      # This machine only. Use "8001:8001" to let other machines reach the mock
      - "127.0.0.1:8001:8001"
    restart: unless-stopped
    volumes:
      - ./.llmockrc.json:/app/.llmockrc.json:ro
      - ./fixtures:/app/fixtures:ro
```

**.llmockrc.json**

```json
{
  "defaultModel": "claude",
  "models": {
    "claude": {
      "name": "claude",
      "model": "claude-opus-5-5",
      "endpoint": "v1/messages",
      "responseType": "lorem",
      "stream": true,
      "responseDelay": { "min": 300, "max": 500 },
      "responseRules": [
        { "match": "Summarise this document", "file": "fixtures/summary.json" }
      ]
    }
  },
  "server": { "port": 8001, "host": "0.0.0.0" }
}
```

Start it and point your app at `http://localhost:8001`:

```bash
docker compose -f docker/llmock/docker-compose.yml up --build
```

Config and fixtures are mounted from your project, so neither needs a rebuild: restart the container after editing the config, while fixture edits apply on the next request. Requests containing a `match` string get the fixture file back (see [Response rules](/guide/response-rules#response-rules-fixture-replies)); everything else gets generated lorem text.

If you use `storedResponsesFile`, keep that file in the mounted `fixtures` folder (or mount it separately) so it sits at the same path relative to the config inside the container. The same goes for every file a rule names.

You can wrap the command in an npm script such as `"mock:start"`.

## Manual Docker commands

```bash
docker compose up -d --force-recreate       # build and start
docker compose logs -f                      # view logs
docker compose down --volumes               # stop and clean up
docker compose down --volumes && docker compose up -d --force-recreate --build  # rebuild
```

> **Note:** LLMock is intended for local development and testing only.
