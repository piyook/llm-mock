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
  - `responseRules` (each rule's `match`, the `text` or `files` it replies with, its `stopReason` and its `fail` settings, `null` if it replies; `source` is `runtime` for a rule added through the admin API, which also has an `id`, and a `times` if it only answers that many more requests)
  - `adminApi` (`ENABLED` or `DISABLED`)
  - `uiTheme` (`dark` or `light`, from `UI_THEME`, `--uiTheme` or `server.uiTheme`). The server also writes it to the page as `<html data-theme="…">`, which is what `ui/src/styles.css` goes by; colours are CSS variables on `:root`, with the light theme's under `:root[data-theme='light']`

- The viewer dialog reads file contents from `/ui-stored-responses` and `/ui-rule-file?rule=<i>&file=<j>` (`i` is the rule's place among the config file's rules, not counting runtime rules), and the most recent logged requests (10 unless `maxLoggedRequests` is set) from `/ui-request-log`, shown one at a time. **Clear logs** sends `DELETE /ui-request-log`. A rule's own `text` is shown straight from `/ui-meta`. **Reset** in the Admin API box sends `POST /admin/reset`. The switch buttons (`cy-data="switch_…"`) and the **Change** buttons (`ui/src/SettingEditor.svelte`: `change_…`, `edit_…_<key>`, `save_…`) send `PATCH /admin/settings`, `/admin/chaos` or `/admin/delay` and are only drawn while `adminApi` is `ENABLED`.

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

