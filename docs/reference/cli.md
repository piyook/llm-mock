# CLI reference

## Commands

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

All CLI flags support both `--key=value` and `--key value` formats and override `.llmockrc.json` at runtime. `start` is the default command, so `llmock --model=claude` works too.

`llmock start` returns once the server is answering. If the server cannot start (for example a config error), or one is already running on that port, it exits with an error instead; run with `--foreground` to see the server's own output.

`--port=0` lets the system pick a free port. `llmock start` then prints the port it got (`Server is running at: http://0.0.0.0:54321`) and the `llmock stop --port=54321` that stops it; with `--foreground` the server prints it in its `SERVER UP AND RUNNING` line. The dashboard and `GET /ui-meta` show the real port.

## CLI options

Each option overrides the matching setting of the selected preset for that run:

| Option | Overrides | Value |
|---|---|---|
| `--model` | `defaultModel` | Name of a preset in `.llmockrc.json` |
| `--port` / `--host` | `server.port` / `server.host` | Port number (`0`: any free port) / address |
| `--admin` | `server.admin` | `true` or `false` |
| `--uiTheme` | `server.uiTheme` | `dark` or `light` |
| `--llmspy` | `server.llmspy` | No value (on), `true`/`false`, or LLMSpy's address. Prints how to use the server through [LLMSpy](/guide/llmspy#using-with-llmspy) |
| `--endpoint` | `endpoint` | Path without a leading slash |
| `--responseType` | `responseType` | `lorem` or `stored` |
| `--maxLoremParas` | `maxLoremParas` | Number |
| `--validateRequests` | `validateRequests` | `true` or `false` |
| `--logRequests` | `logRequests` | `true` or `false` |
| `--maxLoggedRequests` | `maxLoggedRequests` | `1` to `100` |
| `--debug` | `debug` | `true` or `false` |
| `--stream` | `stream` | `true` or `false` |
| `--delayMin` / `--delayMax` | `responseDelay.min` / `.max` | Milliseconds |
| `--chaos` | `chaos.enabled` | `true` or `false` |
| `--chaosFrequency` | `chaos.frequency` | Whole number, `1` or more |
| `--chaosMode` | `chaos.mode` | `every` or `random` |
| `--chaosStatus` | `chaos.status` | `400` to `599` |
| `--chaosKind` | `chaos.kind` | `http`, `stream-error`, `stream-drop` or `stream-stall` |
| `--chaosAfterChunks` | `chaos.afterChunks` | Whole number, `0` or more |
| `--embeddings` | `embeddings.enabled` | `true` or `false` |
| `--embeddingDimensions` | `embeddings.dimensions` | Number |
| `--record` | `recordings.upstream` | The provider's URL, e.g. `https://api.anthropic.com` (empty: replay only). See [Recording real replies](/guide/recording#recording-real-replies) |
| `--recordings` | `recordings.dir` | Folder, relative to the config file (default `recordings`) |
| `--foreground` | | No value; keeps the server attached (see [Foreground mode](/guide/installation#foreground-mode)) |

An on/off option is on for `true`, `1`, `on` or `yes` (in any case) and off for anything else.

`llmock help` prints the same list. `responseRules` and `storedResponsesFile` can only be set in the config file; to add a rule to a running server, use the [admin API](/reference/admin-api#admin-api-changing-rules-and-settings-while-running).
