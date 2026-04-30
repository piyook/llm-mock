# create-llmock

Scaffolding tool for creating LLMock projects with `npm create llmock@latest`.

## Usage

Create a new LLMock project:

```bash
npm create llmock@latest my-project
```

Or using npx:

```bash
npx create-llmock my-project
```

## What's Included

The generated project includes:

- **llmock dependency** - The main LLMock package
- **Configuration file** - `.llmockrc.json` with sensible defaults
- **Example requests/responses** - Sample files for OpenAI and Gemini APIs
- **npm scripts** - Convenient scripts for starting/stopping the server
- **Documentation** - README with setup instructions

## Project Structure

```
my-project/
├── package.json          # Project dependencies and scripts
├── .llmockrc.json        # LLMock configuration
├── README.md            # Project documentation
├── requests/            # Request templates
│   ├── openai-chat.json
│   └── gemini-chat.json
└── responses/           # Response templates
    ├── openai-chat-response.json
    └── gemini-chat-response.json
```

## Available Scripts

- `npm run llmock:start` - Start the LLMock server
- `npm run llmock:stop` - Stop the LLMock server
- `npm run llmock:chatgpt` - Run with ChatGPT model
- `npm run llmock:gemini` - Run with Gemini model
- `npm run llmock:streaming` - Run with streaming responses
- `npm run llmock:embeddings` - Run with embeddings model

## Development

This scaffolding tool is part of the LLMock ecosystem. For more information about LLMock itself, visit: https://github.com/piyook/llm-mock
