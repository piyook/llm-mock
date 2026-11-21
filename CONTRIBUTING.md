# Contributing to LLMock

Thanks for helping. This page covers how to set the repository up, where things live and what has to pass before a change goes in. How to _use_ LLMock is on the [docs site](https://llmock.piyook.com).

## Setup

You need Node.js 24 or later.

```bash
git clone https://github.com/piyook/llm-mock.git
cd llm-mock
npm install                   # also installs the dashboard's dependencies in ui/
npm --prefix docs install     # only if you will work on the docs site
```

Run the server from the source with `npm run llmock` (or `npm run llmock:claude`, `llmock:chatgpt`, and so on). It listens on port 8001.

## Where things live

| Path | What it is |
|---|---|
| `src/` | The server (Fastify, TypeScript) |
| `bin/` | The `llmock` command |
| `ui/` | The dashboard (Svelte). See [UI-Dev.md](UI-Dev.md); `npm run compile-ui` builds it into `ui/dist/` |
| `docs/` | The docs site (VitePress), served at [llmock.piyook.com](https://llmock.piyook.com) |
| `cypress/` | End-to-end tests |
| `create-llmock/` | The `npm create llmock` starter |
| `llms.txt` | The compact reference for coding agents; update it when the CLI, config or response shapes change |

## Docs

User documentation lives in `docs/`, not in the README. Keep the README short: it is also the npm page.

- `npm run docs:dev` serves the site at http://localhost:5173 and reloads as you edit.
- `npm run docs:build` builds it and checks every link to a heading (`#anchor`), which VitePress does not check by itself. Run it before you push a docs change.
- Images go in `docs/public/images/`. A path outside `docs/` works in the build but breaks in `docs:dev`.
- The sidebar in `docs/.vitepress/config.mts` sets the page order and the Prev/Next links.

## Branches and pull requests

- Branch from `dev` and open the pull request into `dev`. `main` only takes releases from `dev`.
- Branch names must be `feat/…`, `fix/…`, `chore/…`, `hotfix/…` or `release/…`. The pre-push hook rejects other names.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint. Use an empty scope, and keep body lines to 100 characters or fewer:

```
feat(): add GET /v1/models
fix(): send content-type on OpenAI streams
chore(deps): update vitest
```

## Checks

`git push` runs these, in order:

1. branch name check
2. `npm run pretty` (Prettier)
3. `npm run lint` (oxlint)
4. `npm audit --omit=dev`
5. `npm run test:unit` (Vitest)
6. `npm run test:e2e` (Cypress, about 3 minutes; starts the server for each suite, so port 8001 must be free)

Pull requests run the same checks in CI. If a new advisory in a production dependency fails the audit step, fix it in its own `fix():` commit rather than skipping the hook.
