import { execSync } from "child_process";

const suites = [
  { start: "llmock:start:chatgpt", spec: "cypress/e2e/gpt-mock-spec.cy.ts" },
  { start: "llmock:start:gemini",  spec: "cypress/e2e/gemini-mock-spec.cy.ts" },
  { start: "llmock:start:streaming", spec: "cypress/e2e/streaming-only-spec.cy.ts" },
  { start: "llmock:start:embeddings", spec: "cypress/e2e/embeddings-spec.cy.ts" },
];

const npmRun = (cmd) => execSync(`npm run ${cmd}`, { stdio: "inherit" });
const cypress = (spec) => execSync(`npx cypress run --spec "${spec}"`, { stdio: "inherit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = false;

for (const { start, spec } of suites) {
  try {
    npmRun(start);
    await sleep(3000);
    cypress(spec);
  } catch (e) {
    console.error(`>>> Suite FAILED: ${start}`, e.message);
    failed = true;
  } finally {
    try { npmRun("llmock:stop"); } catch { /* ignore stop errors */ }
  }
}

process.exit(failed ? 1 : 0);