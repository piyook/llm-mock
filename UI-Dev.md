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

  - `serverPort`
  - `llmUrlEndpoint`
  - `llmName`
  - `mockResponseType`
  - `responseDelayMinMs` / `responseDelayMaxMs`
  - `apiLinks` (resolved API URLs based on `LLM_URL_ENDPOINT`)

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
- API and meta requests such as `/ping`, `/ui-meta`, `/logs`, and typical LLM endpoints are proxied to `http://localhost:8001` (you’ll still want the main server running via `npm run dev` during UI work).

