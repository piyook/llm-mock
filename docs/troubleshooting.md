# Troubleshooting

**Server not responding**

Confirm the server is running and the port matches `.llmockrc.json`. Open `http://localhost:8001` — if it's unreachable, the server may not have started.

**`llmock start` exits with an error**

Run `llmock start --foreground` with the same options to see the server's output. If it reports a server already running on the port, run `llmock stop` (with `--port` if it isn't 8001) first.

The server refuses to start on a malformed `responseRules` entry, or on a `storedResponsesFile` that is missing or not valid; the message names the setting and the file. It also refuses a `chaos` setting that is not valid (see [Chaos mode](/guide/delay-and-chaos#chaos-mode-error-simulation)).

**Calls fail with a 500 or another error you didn't expect**

Check whether chaos is on: the **Chaos** box on the dashboard's **Settings** page shows `ENABLED`, and a chaos error carries the header `x-llmock-chaos: true`. Set `"chaos": { "enabled": false }` in the preset (or drop `--chaos=true`) and restart.

**Port already in use**

Change the port in `.llmockrc.json` or pass it as a flag:

```bash
llmock start --port=8002
```

**Request validation failures**

- For the `claude` preset, `model`, `max_tokens` and `messages` are all required
- Confirm your request template matches the provider's API format
- Check the request shape with **View request log** on the dashboard
- Verify the `name` field in your model config matches the template filename prefix

**Response delays not applied**

Ensure `responseDelay.min` or `responseDelay.max` is greater than `0`, then restart the server.

**A fixture or stored reply returns an error**

The file could not be read when the request arrived. Check that the path is relative to the folder holding `.llmockrc.json` and, in Docker, that the file is mounted into the container.
