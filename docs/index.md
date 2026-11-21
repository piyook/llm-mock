---
layout: home

hero:
  name: LLMock
  text: Mock LLM APIs for dev and testing
  tagline: Point your OpenAI, Anthropic or Gemini SDK at a local server. Realistic replies, no API key, no cost, no network.
  image:
    src: /logo.svg
    alt: LLMock
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Installation
      link: /guide/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/piyook/llm-mock

features:
  - icon: 🔌
    title: OpenAI, Claude and Gemini
    details: Chat completions and the Responses API, the Anthropic Messages API with the SDK's streaming events, Gemini, and any OpenAI-style API.
    link: /guide/providers
    linkText: Providers
  - icon: 🎯
    title: Replies you choose
    details: Answer a chosen prompt with your own text, JSON or a Claude tool call. Everything else gets generated text or your own pool of replies.
    link: /guide/response-rules
    linkText: Response rules
  - icon: ⏺️
    title: Record and replay
    details: Send unknown calls to the real provider once, save the replies as fixtures, and replay them offline in CI.
    link: /guide/recording
    linkText: Recording
  - icon: 💥
    title: Chaos mode
    details: Fail every call or 1 in X with a 429, a 500 or any status, or break a stream part-way through, to test retries and error handling.
    link: /guide/delay-and-chaos
    linkText: Delays and chaos
  - icon: 🧪
    title: Made for tests
    details: Start a server from your test on a free port, then check the exact request your code sent. Change replies at run time through the admin API.
    link: /guide/testing-from-code
    linkText: Using LLMock in tests
  - icon: 📊
    title: See every call
    details: A live dashboard and a request log show each request, whether it passed validation, and what it got back. Works with LLMSpy too.
    link: /guide/dashboard-and-logging
    linkText: Dashboard and logging
---

## Try it

```bash
npm create llmock@latest my-project
cd my-project
npm install
npm run llmock:start
```

Then open `http://localhost:8001` for the dashboard. [Getting started](/guide/getting-started) walks you through your first request.

![The LLMock dashboard](/images/server-page.png)

::: tip Using a coding agent?
Point it at [`llms.txt`](/llms.txt) (also shipped in the npm package at `node_modules/llmock/llms.txt`): a compact reference to the CLI, config schema, response shapes and gotchas.
:::
