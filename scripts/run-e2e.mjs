import { execSync } from "child_process";

const suites = [
  { start: "llm-mock:start:chatgpt", spec: "cypress/e2e/gpt-mock-spec.cy.ts" },
  { start: "llm-mock:start:gemini",  spec: "cypress/e2e/gemini-mock-spec.cy.ts" },
  { start: "llm-mock:start:streaming", spec: "cypress/e2e/streaming-only-spec.cy.ts" },
  { start: "llm-mock:start:embeddings", spec: "cypress/e2e/embeddings-spec.cy.ts" },
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
    failed = true;
  } finally {
    try { npmRun("llm-mock:stop"); } catch (_) { /* ignore stop errors */ }
  }
}

process.exit(failed ? 1 : 0);