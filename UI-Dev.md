## UI Development (Svelte Dashboard)

This project includes a Svelte-based dashboard for inspecting and testing the mock LLM server.

### What gets served

- The compiled dashboard is served at:

  ```bash
  http://localhost:8001/
  ```

- The UI reads configuration and endpoint metadata from:

  ```bash
  http://localhost:8001/ui-meta
  ```

  This JSON endpoint includes:

  - `version` (the running llmock version)
  - `serverPort`
  - `llmUrlEndpoint`
  - `llmName`
  - `mockResponseType`
  - `responseDelayMinMs` / `responseDelayMaxMs`
  - `chaosStatus`, `chaosFrequency`, `chaosMode`, `chaosErrorStatus`, `chaosKind`, `chaosAfterChunks` (the chaos settings) and `chaosInjected` (calls failed since the server started)
  - `apiLinks` (resolved API URLs based on `LLM_URL_ENDPOINT`)
  - `storedResponsesCount` / `storedResponsesFile` (when the response type is `stored`)
  - `responseRules` (each rule's `match`, the `files` it replies with, its `stopReason` and its `fail` settings, `null` if it replies)

- The viewer dialog reads file contents from `/ui-stored-responses` and `/ui-rule-file?rule=<i>&file=<j>`, and the most recent logged requests (10 unless `maxLoggedRequests` is set) from `/ui-request-log`, shown one at a time. **Clear logs** sends `DELETE /ui-request-log`.

### Running everything locally

To build the UI and start the mock server together:

```bash
npm run dev
```

This will:

- Build the Svelte dashboard into `ui/dist`
- Start the Fastify mock server on `http://localhost:8001`
- Serve the compiled UI from the server root

### Working on the UI only (hot reload)

For live UI development, use the dedicated Svelte/Vite dev server:

```bash
npm run ui-dev
```

- The UI dev server runs on `http://localhost:5173/`
- API and meta requests such as `/ping`, `/ui-meta`, `/ui-request-log`, and typical LLM endpoints are proxied to `http://localhost:8001` (you’ll still want the main server running via `npm run dev` during UI work).

