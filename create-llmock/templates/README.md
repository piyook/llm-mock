# {{PROJECT_NAME}}

This project uses LLMock to provide mock LLM API responses for testing and development.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the mock server:
   ```bash
   npm run llmock:start
   ```

3. Stop the server:
   ```bash
   npm run llmock:stop
   ```

## Available Scripts

- `npm run llmock:start` - Start the LLMock server
- `npm run llmock:stop` - Stop the LLMock server
- `npm run llmock:chatgpt` - Run with ChatGPT model
- `npm run llmock:gemini` - Run with Gemini model
- `npm run llmock:streaming` - Run with streaming responses
- `npm run llmock:embeddings` - Run with embeddings model

## Configuration

The server configuration is in `.llmockrc.json`. You can modify:

- Server host and port
- Logging settings
- Response delays
- Endpoint paths
- Request and response directories

## Customizing Responses

### Requests
Place your request templates in the `requests/` directory. The server will match incoming requests to these templates.

### Responses
Place your response templates in the `responses/` directory. These define the mock responses that will be returned.

### Example Files

The project includes example files for:
- OpenAI ChatGPT (`openai-chat.json` / `openai-chat-response.json`)
- Google Gemini (`gemini-chat.json` / `gemini-chat-response.json`)

## Server Endpoints

Once started, the server will be available at:
- OpenAI compatible: `http://localhost:3000/v1/chat/completions`
- Gemini compatible: `http://localhost:3000/v1/models/gemini-pro:generateContent`
- Embeddings: `http://localhost:3000/v1/embeddings`

## Development

For more information about LLMock, visit the main repository: https://github.com/piyook/llm-mock
