# llmock feature roadmap: the 15-row table, sized and ordered

## Context

The table lists 15 features that would move llmock from "returns lorem or canned text" to "scripts realistic agent conversations". This plan sizes each one against the code as it was at 3.8.1, explains what each is for, and puts them in a build order. Rows that have changed since are marked with the version that changed them.

Summary: about a third of the table is already partly built. The real gaps are **tool calls**, **turn-aware matching**, **runtime control from tests** and **record/replay**. **Error injection** was a gap too; its first part shipped in 3.9.0 as chaos mode (see row 9). Nearly everything depends on two small refactors, which went first and are done (Phase 0).

Sizes: **S** = up to 1 day, **M** = 2-3 days, **L** = 4-7 days. These are rough estimates for one person, including unit tests, Cypress e2e, README/`llms.txt` and dashboard updates.

## Where llmock stands today

| # | Feature | Today | Gap | Size |
|---|---|---|---|---|
| 1 | Rich fixtures | Partial: `responseRules` (`match` → `file`/`files`) | Reply is text only, dropped into the envelope | M |
| 2 | Match types | Case-sensitive substring over every string in the body | No exact/regex, no field scoping | S |
| 3 | Multi-turn | None. `llms.txt` documents the pain: a rule that matched turn 1 keeps matching later turns | `turnIndex`, `hasToolResult`, last-user-message matching | S |
| 4 | Tool calls | None ("Replies are text only") | 3 wire formats x static + streaming | L |
| 5 | Streaming fidelity | OpenAI and Claude SSE exist | ~5 chunks at fixed 50 ms; Gemini streams OpenAI-shaped chunks; openai ignores request `stream` | M |
| 6 | Record & replay | None | Upstream proxy, SSE collapse, fixture writer | L |
| 7 | Model matching | Accidental (substring also hits `model`) | Dedicated `match.model` + suffix normalisation | S |
| 8 | System matching | Accidental (same) | Dedicated `match.systemMessage`, per-provider extraction | S |
| 9 | Chaos | Partial (3.9.0): `chaos: { enabled, frequency, mode, status }` fails every call or 1 in X calls (counter or random) with a provider-shaped error body and `retry-after`, on the chat and embeddings routes; shown on the dashboard | Timeouts, malformed bodies, mid-stream drops, forcing an outcome per request, scripted errors from rules | S-M |
| 10 | Programmatic API | None; `server.ts` is a top-level script driven by `process.env` | See Phase 5 | M (HTTP) / L (in-process) |
| 11 | Richer CLI | Mostly there: start/stop/config + 19 flags | New flags as features land, `validate` command | S |
| 12 | Validation | Partial: shape checks + missing-file warnings at boot | Shadowing/duplicate detection | S |
| 13 | Metrics | Request log only (validated requests) | Matched-rule id in log, `/metrics` | S |
| 14 | More providers | OpenAI chat, Claude, Gemini, embeddings, custom templates | One preset per process; no Responses API, Ollama, Bedrock | M each, Bedrock L |
| 15 | Test isolation | None | `X-Test-Id` scoping; only meaningful once #10 exists | S |

## What each feature is for

1. **Rich fixtures**: "when the request looks like X, reply exactly Y", where Y can be more than text. *Scenario:* a triage test asserts your code parses a specific JSON verdict and a specific stop reason.
2. **Match types**: say precisely what "looks like X" means. *Scenario:* `"summarise"` currently also fires on a request that merely quotes that word in an earlier turn; a regex anchored on the last user message doesn't.
3. **Multi-turn**: an agent calls the model several times per task. *Scenario:* turn 0 returns "call `search`", turn 1 (tool result present) returns the final answer. Without this the same rule fires forever and the agent loops.
4. **Tool calls**: the mock returns `tool_calls` / `tool_use` blocks. *Scenario:* verifying your agent dispatches `get_weather({city})`, handles bad arguments, and handles parallel calls. This is the single biggest gap for anyone testing agents.
5. **Streaming fidelity**: realistic time-to-first-token and tokens/sec. *Scenario:* testing a chat UI's typing indicator, cancel button and partial-render logic, which a 5-chunk burst never exercises.
6. **Record & replay**: run once against the real API, save the replies as fixtures, replay in CI. *Scenario:* a 40-step agent run nobody wants to hand-write fixtures for; also zero token cost in CI.
7. **Model matching**: *Scenario:* app uses a cheap model to classify and a large one to answer, with overlapping prompts; each needs its own reply. Normalising `gpt-4o-2024-08-06` → `gpt-4o` stops fixtures breaking on version bumps.
8. **System matching**: *Scenario:* one server backs a "support" persona and a "sales" persona that receive identical user text.
9. **Chaos**: *Scenario:* proving your retry/backoff works on 429 and 529 (possible since 3.9.0), that a stream cut mid-reply doesn't leave the UI hung, that malformed JSON is caught.
10. **Programmatic API**: set replies from inside a test rather than a shared config file. *Scenario:* `mock.addRule(...)` in `beforeEach`, `mock.requests()` to assert what your app actually sent.
11. **CLI**: *Scenario:* `llmock start --fixtures ./fixtures --record --latency 200` in a CI step, `llmock validate` as a pre-commit check.
12. **Validation**: *Scenario:* a broad rule placed above a specific one silently swallows it and a test passes for the wrong reason; boot prints "rule 3 can never match, shadowed by rule 1".
13. **Metrics**: *Scenario:* a CI run fails and you need to see which rule answered each request, or that 12 requests fell through to lorem.
14. **Providers**: *Scenario:* app uses the OpenAI Responses API or a local Ollama model, neither of which llmock speaks.
15. **Isolation**: *Scenario:* parallel test workers share one mock; worker A's rules and turn counters must not leak into worker B.

## Build order

### Phase 0: two refactors everything else needs (M): done

Both are on `dev` and not yet in a release. Behaviour is unchanged; they are the groundwork for Phases 1 and 2.

- **Request normaliser** (`normaliseRequest` in `src/utilities/normalise-request.ts`): turns an OpenAI / Claude / Gemini body into one shape: `{ model, systemText, lastUserText, turnIndex, hasToolResult, allText }`. Per-provider extraction (OpenAI `system`/`developer` roles, Claude top-level `system`, Gemini `systemInstruction`). Response rules now match against its `allText`.
- **Reply object** (`MockReply` in `src/types.ts`): `generateResponseContent` in `src/utilities/response-helpers.ts` returns `{ text, toolCalls?, stopReason?, error?, ruleId? }` in place of a string, and `handleRequest` (`src/api/completions/api.ts`) passes it to all four builders. Only `text` is produced and used so far.

### Phase 1: matching, #2 #7 #8 #3 #12 and the schema half of #1 (M)

Extend `responseRules` rather than adding a parallel fixtures system, so existing configs keep working:

- `match: "text"` keeps today's meaning. New object form: `match: { userMessage, systemMessage, model, turnIndex, hasToolResult }`, each text field a string (substring) or `{ type: "exact" | "regex", ... }`.
- Add an optional `id` per rule (used later by metrics and recording) and an optional `rulesDir` that loads one rule per JSON file (record mode needs somewhere to write).
- Extend `validateResponseRules` and the boot check in `src/server.ts` with duplicate and shadowing warnings; add `llmock validate`.
- Skip `predicate` (JS functions in config): it is a code-execution surface for little gain over regex.

### Phase 2: tool calls, #4 and the response half of #1 (L)

- Rule gains `response: { text?, toolCalls?: [{ name, arguments }], stopReason? }` alongside `file`/`files`.
- Static: `build-response.ts` (OpenAI `message.tool_calls`, `finish_reason: "tool_calls"`; Gemini `functionCall` parts) and `build-claude-response.ts` (`tool_use` blocks, `stop_reason: "tool_use"`).
- Streaming: `build-streaming-response.ts` (indexed `tool_calls` deltas with split `arguments`) and `build-claude-streaming-response.ts` (`input_json_delta`, multiple content blocks).
- Most of the effort is wire-format accuracy; verify against the real OpenAI and Anthropic SDKs, not hand-written assertions.

### Phase 3: streaming fidelity #5 and the rest of chaos #9 (M + S-M)

- Replace the duplicated per-chunk delay in `streamWithDelay` / `streamClaudeEvents` with one pacing helper in `src/utilities/delay.ts`: `ttft`, `tps`, `jitter`. Honour the request's `stream` flag for the openai format (`stream-mode.ts`), add the `include_usage` chunk, and give Gemini its own stream shape.
- Chaos, already shipped in 3.9.0 (`src/utilities/chaos.ts`, one `applyChaos(reply)` call in each of the two route handlers): preset `chaos: { enabled, frequency, mode, status }` and the `--chaos`, `--chaosFrequency`, `--chaosMode`, `--chaosStatus` flags. `frequency` is X in "1 in X calls"; `mode` is `every` (a counter, deterministic) or `random`. Provider-shaped error bodies, `retry-after` on 429/503/529, an `x-llmock-chaos: true` response header, a Chaos card on the dashboard and the settings in `/ui-meta`.
- Chaos, still to do. Extend that shape rather than adding a second one (this replaces the earlier `errorRate` / `timeoutRate` / `malformedRate` / `disconnectRate` sketch):
  - More failure kinds beside the HTTP error: a timeout (never answer, or answer after a set wait), a malformed body, and a mid-stream disconnect. A `chaos.type` setting, or a list to pick from at random, selects them; `frequency` and `mode` keep deciding which calls fail. The mid-stream disconnect hooks into the pacing helper above, which is why it waits for this phase.
  - An `X-LLMock-Chaos` request header to force one outcome on one call, whatever the counter says.
  - Rules returning `response.error` for a scripted failure (needs the reply object from Phase 0, where `error` is already reserved).
  - The call counter is per server; scoping it per test belongs with `X-Test-Id` in Phase 5.

### Phase 4: metrics #13 and CLI #11 (S + S)

- Record `ruleId` (or `fallback`) on each log entry in `src/utilities/logger.ts`; show it in the dashboard request log; add `/metrics` as hand-written Prometheus text (no dependency).
- CLI: keep the hand-rolled parser in `bin/process-utils.js`; a rewrite on commander buys nothing. Add flags as features land.

### Phase 5: runtime control #10 and isolation #15 (M + S)

Recommendation: an **HTTP control API first**, not an in-process library.

- `POST/DELETE /__llmock/rules`, `GET /__llmock/requests`, `POST /__llmock/reset`, plus a small plain-JS client exported from the package. Works from any language and test runner.
- Rules and counters registered with an `X-Test-Id` are only visible to requests carrying that header; that is the whole of #15.
- A true in-process `createMockServer()` is an L on its own: `server.ts` runs at import with `process.exit`, settings live in `process.env`, config is cached at module level, and the package ships TypeScript run through `tsx`, so consumers could not import it without a build step. Defer it unless someone asks.

### Phase 6: record & replay #6 (L)

- `--record --upstream=<url>`: when no rule matches, forward the request with the caller's own auth header, return the real reply, collapse SSE into a rule and write it to `rulesDir` keyed on model, system text, last user message and turn index.
- Comes last because the saved rule needs everything above: match fields, tool calls and stop reasons. Must redact auth headers and never log keys.

### Phase 7: providers #14 (M each, open-ended)

Order by demand: OpenAI Responses API (`/v1/responses`), then serving several formats from one server, then Ollama (NDJSON), with `/v1/models` and `count_tokens` as cheap extras. Bedrock last: its binary event-stream framing is L by itself.

## Totals and suggested cut

- Phases 0-2 (about 2 weeks; Phase 0 is done): fixes the documented multi-turn problem and adds tool calls. This is the highest-value slice and makes llmock usable for agent testing.
- Phases 3-5 (about 2 more weeks): resilience testing and per-test control.
- Phase 6 (about 1 week), Phase 7 (2-3 days per provider).
- All of it except extra providers: roughly 5-7 weeks.

Recurring cost to budget for: each new setting is plumbed through three places (`applyConfigDefaults` in `bin/process-utils.js`, `setEnvironmentVariables` in `bin/llmock.js`, `setEnvironmentFromConfig` in `src/config/config-loader.ts`), and each feature also touches the Svelte dashboard, `llms.txt`, README and the `create-llmock` templates.

## Verification (per phase)

- Unit: Vitest specs beside the existing ones in `src/tests/utilities/` (`npm run test:unit`).
- E2E: Cypress specs in `cypress/e2e/` against `.llmockrc.test.json` (`npm run test:e2e`).
- Wire fidelity (Phases 2, 3, 7): add the `openai` and `@anthropic-ai/sdk` packages as dev dependencies and run a scripted tool-call loop, streamed and non-streamed, through each SDK against the mock. If the SDK parses it without error, the shape is right.
- Back-compat: existing `responseRules` configs and all current Cypress specs must pass unchanged after Phases 0 and 1.
