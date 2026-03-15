# Local Mock LLM API Framework

[![GitHub Release](https://img.shields.io/github/v/release/piyook/llm-mock)](https://github.com/piyook/llm-mock/releases)
[![tests workflow](https://github.com/piyook/llm-mock/actions/workflows/tests.yaml/badge.svg)](https://github.com/piyook/llm-mock/actions/workflows/tests.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

- [Overview](#overview)
- [Why Use LLM Mock?](#why-use-llm-mock)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Server Status Dashboard](#server-status-dashboard)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Embeddings Configuration](#embeddings-configuration)
  - [Streaming Responses](#streaming-responses)
  - [Response Delay Simulation](#response-delay-simulation)
  - [Custom API Paths](#custom-api-paths)
- [Features](#features)
  - [Available Endpoints](#available-endpoints)
  - [Response Types](#response-types)
  - [Request Validation](#request-validation)
  - [Request Logging](#request-logging)
- [Integration Guide](#integration-guide)
  - [Using with LangChain and OpenAI-Style APIs](#using-with-langchain-and-openai-style-apis)
  - [Making API Requests](#making-api-requests)
  - [Embeddings API](#embeddings-api)
  - [Client Configuration](#client-configuration)
- [Supporting Different LLM Providers](#supporting-different-llm-providers)
  - [OpenAI-Style API Compatibility](#openai-style-api-compatibility)
  - [Creating Custom Templates](#creating-custom-templates)
- [Debugging](#debugging)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Local Mock LLM API Framework is a lightweight, standalone server that simulates Large Language Model APIs for development and testing purposes. It provides a complete mock environment that mimics the behavior of popular LLM services like OpenAI's ChatGPT, enabling developers to build, test, and prototype AI-powered applications without incurring API costs or requiring internet connectivity.

### Key Capabilities

- **OpenAI-Style API Compatibility**: Implements the same request/response formats as popular LLM providers
- **Multiple Response Types**: Supports both dynamic lorem ipsum generation and stored response templates
- **Streaming Support**: Simulates real-time streaming responses for chat applications
- **Mock Embeddings**: Provides deterministic embedding vectors for testing vector search and RAG systems
- **Request Validation**: Validates incoming requests against configurable templates
- **Interactive Dashboard**: Web-based interface for monitoring server status and API requests
- **Flexible Configuration**: Extensive environment variable support for customizing behavior

### Architecture

The framework uses a template-based approach where request/response pairs are defined as JSON templates, allowing for easy customization and support for different LLM providers. The server is built with Fastify and provides a RESTful API that can be seamlessly integrated into existing development workflows.

Perfect for frontend developers, QA engineers, and teams looking to accelerate AI application development without the overhead of managing real LLM services.

### Why Use LLM Mock?

- **Free and Fast**: No API costs, instant responses for rapid prototyping
- **Easier Setup**: Simpler than running a full local LLM for frontend development
- **Consistent Testing**: Predictable, repeatable responses for testing UI logic
- **Offline Capable**: Work without internet connectivity
- **Full Visibility**: Complete debugging and logging of all LLM requests
- **Request Validation**: Verify your requests match the expected API format
- **Realistic Delays**: Simulate production API response times to test loading states and timeout handling
- **Streamed or Static Responses**: Choose between streaming Server-Sent Events or static JSON responses to match your target LLM API behavior
- **OpenAI-Style API Compatibility**: Works with any OpenAI-compatible API including ChatGPT, Grok, Llama, DeepSeek, and more
- **Mock Embeddings Support**: Generate deterministic mock embeddings for testing vector search, RAG systems, and semantic similarity applications without actual embedding model costs
- **Robust Local Server Framework**: Built with [Fastify](https://www.fastify.io/) for high performance and reliability

Adapted from the [mock-api-framework-template](https://github.com/piyook/mock-api-framework-template).

## Prerequisites

- Node.js 20+
- Docker (for containerized deployment)
- npm or compatible package manager

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/piyook/llm-mock.git
cd llm-mock
npm install
```

## Quick Start

### Using Docker (Recommended)

Start the server in Docker containers:

```bash
npm start
```

Your LLM API will be available at `http://localhost:8001` by default.

**Managing Docker Containers:**

```bash
# Stop and remove containers
npm stop

# Rebuild containers
npm run rebuild

# Complete cleanup (removes node_modules, caches, and all Docker resources)
npm run nuke
```

### Running Locally

Run directly on your machine without Docker:

```bash
npm run dev
```

This starts the mock server locally. For details on the Svelte-based dashboard and UI development workflow, see `UI-Dev.md`.

## Server Status Dashboard   

Once the server is running, navigate to **`http://localhost:8001`** to access the interactive server status dashboard. This web interface provides real-time visibility into your mock server configuration and activity. 
   
     
![LLM Mock Server Page](images/server-page.png)

### Dashboard Features

- **Server Status**: Real-time indicator showing if the server is running and accessible
- **Configuration Display**: Shows all current environment variables and settings including:
  - Server port and URL
  - LLM model and template configuration
  - Response type (Lorem Ipsum vs Stored)
  - Request validation and logging status
  - Streaming mode configuration
  - Response delay settings
  - **Embeddings endpoint status** and dimensions
- **API Endpoints**: Direct links to all available endpoints (chat completions, embeddings, etc.)
- **Request Logs**: Access to detailed request logs at `/logs` for debugging

### Navigation

1. **Main Dashboard**: `http://localhost:8001` - Overview and configuration
2. **Request Logs**: `http://localhost:8001/logs` - Detailed API request history
3. **Health Check**: `http://localhost:8001/ping` - Simple server status check

The dashboard updates automatically every 2 seconds to reflect real-time changes in server configuration and status.

## Configuration

### Environment Variables

Configure the mock server by editing the `.env` file:

#### Server Settings

```bash
# Server port (default: 8001)
SERVER_PORT=8001

# API URL prefix (default: 'api')
# Set to blank for no prefix, or customize as needed
LLM_URL_ENDPOINT=api

# Debug mode - shows detailed request/response info in terminal
DEBUG=*  # Set to FALSE to disable
```

#### Response Configuration

```bash
# Response type: 'lorem' or 'stored'
MOCK_LLM_RESPONSE_TYPE=lorem

# Maximum sentences for lorem ipsum responses
MAX_LOREM_PARAS=8

# Streaming mode - enables OpenAI-style SSE streaming
STREAM=false

# Request validation
VALIDATE_REQUESTS=true
LOG_REQUESTS=true
```

#### Embeddings Configuration

Enable and configure the mock embeddings endpoint:

```bash
# Enable embeddings endpoint (default: true)
ENABLE_EMBEDDINGS_MOCK=true

# Default embedding dimensions (default: 128)
EMBEDDING_DIMENSION=128
```

#### Streaming Responses

Enable OpenAI-style Server-Sent Events (SSE) streaming for chat-completion responses:

```bash
# Enable streaming mode
STREAM=true

# Disable streaming (default - returns single JSON response)
STREAM=false
```

**How Streaming Works:**

- **`STREAM=true`**: Returns OpenAI-style SSE stream with `chat.completion.chunk` events
- **`STREAM=false`**: Returns standard single JSON response (existing behavior)
- The same endpoint URL is used in both modes - only the server-side response framing differs
- Streaming uses the same response template structure as static mode for consistency

**Streaming Response Format:**
```json
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-124","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-125","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"}}]}

data: {"id":"chatcmpl-126","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Initial Chunk Behavior:**
- The first few chunks (typically 3-4) are sent immediately without delay
- This mimics real LLM API behavior where initial tokens arrive faster
- Subsequent chunks follow the configured `RESPONSE_DELAY_*` timing
- This provides realistic streaming simulation and better user experience

#### Response Delay Simulation

Simulate realistic API response times to test how your application handles network latency, loading states, and timeouts:

```bash
# Minimum delay in milliseconds (default: 0)
RESPONSE_DELAY_MIN=500

# Maximum delay in milliseconds (default: 0)
RESPONSE_DELAY_MAX=2000
```

**How Response Delays Work:**

- The mock server randomly selects a delay between `RESPONSE_DELAY_MIN` and `RESPONSE_DELAY_MAX` for each request
- Delays are applied to both GET and POST endpoints in the completions API
- When both values are `0` or unset, responses are returned immediately (backward compatible with previous versions)
- Helps test loading indicators, timeout handling, and user experience with real-world latency

**Delay Configuration Examples:**

```bash
# No delay - instant responses (default)
RESPONSE_DELAY_MIN=0
RESPONSE_DELAY_MAX=0

# Fast responses (for rapid development)
RESPONSE_DELAY_MIN=100
RESPONSE_DELAY_MAX=300

# Realistic production-like latency
RESPONSE_DELAY_MIN=800
RESPONSE_DELAY_MAX=2500

# Test slow network conditions
RESPONSE_DELAY_MIN=3000
RESPONSE_DELAY_MAX=8000

# Fixed delay (same min/max)
RESPONSE_DELAY_MIN=1000
RESPONSE_DELAY_MAX=1000
```

### Custom API Paths

You can customize endpoints this to match your LLM provider's path structure:

```bash
# ChatGPT format: http://localhost:8001/chatgpt/chat/completions
LLM_URL_ENDPOINT=chatgpt/chat/completions

```

![LLM Mock Server Page](images/image2.png)

```bash
# Gemini format: http://localhost:8001/models/gemini-pro:generateContent
LLM_URL_ENDPOINT=models/gemini-pro:generateContent
```

## Features

### Available Endpoints

The mock server provides the following OpenAI-style endpoints:

- **Chat Completions**: `/chatgpt/chat/completions` (configurable via `LLM_URL_ENDPOINT`)
- **Embeddings**: `/v1/embeddings` (OpenAI-compatible embeddings endpoint)

View all available endpoints by visiting:

```
http://localhost:8001
```

### Response Types

#### 1. Lorem Ipsum Responses

Generate random placeholder text for testing:

```bash
MOCK_LLM_RESPONSE_TYPE=lorem
MAX_LOREM_PARAS=8
```

Generates up to 8 random sentences per response. Perfect for testing UI rendering with variable content lengths.

https://github.com/user-attachments/assets/d36651ac-d7fa-41ad-b8d8-cd23812ae45a

#### 2. Stored Responses

Use predefined responses from `src/data/data.json`:

```bash
MOCK_LLM_RESPONSE_TYPE=stored
```

Add your custom responses to the JSON file:

```json
{
  "responses": [
    "This is a custom response for testing",
    "Another predefined response for consistency",
    "A third response to simulate variety"
  ]
}
```

The server randomly selects from stored responses, allowing you to test with realistic, domain-specific content.

https://github.com/user-attachments/assets/86115f16-63d7-49de-af32-c6f9c2bec7cf


### Request Validation

Validate incoming requests against templates to ensure API compatibility:

1. Add a request template in `request-templates/` folder
2. Enable validation in `.env`:

```bash
VALIDATE_REQUESTS=true
```

Invalid requests return detailed error messages explaining the format mismatch.

### Request Logging

Debug your LLM interactions by logging all requests:

1. Enable logging:

```bash
LOG_REQUESTS=true
VALIDATE_REQUESTS=true
```

2. View logged requests at:

```
http://localhost:8001/logs
```

Displays detailed information about each request including headers, body, and validation status.

## Integration Guide

### Using with LangChain and OpenAI-Style APIs

Configure your endpoint to match the OpenAI chat completion format:

```bash
LLM_URL_ENDPOINT=chatgpt/chat/completions
```

This creates the endpoint: `http://localhost:8001/chatgpt/chat/completions`

### Making API Requests

#### Static Mode (STREAM=false)

```bash
curl -N http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o-mini", "messages": [{"role": "user","content": "Hello"}], "temperature": 1, "n": 1, "stream": false }'
```

Returns a single JSON response:
```json
{
  "id": "chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe",
  "object": "chat.completion", 
  "created": 1678485525,
  "model": "gpt-3.5-turbo-0301",
  "choices": [{"message": {"role": "assistant", "content": "Generated response"}}]
}
```

#### Streaming Mode (STREAM=true)

Set `STREAM=true` in your `.env` file, then use the same endpoint:

```bash
curl -N http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-4o-mini", "messages": [{"role": "user","content": "Hello"}], "temperature": 1, "n": 1, "stream": false }'
```

Returns OpenAI-style SSE stream:
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk",...}

data: {"id":"chatcmpl-124","object":"chat.completion.chunk",...}

data: [DONE]
```

**Note:** The request payload is identical in both modes. The difference is in the server-side response framing, controlled by the `STREAM` environment variable.

### Embeddings API

The mock server also provides an OpenAI-style embeddings endpoint at `/v1/embeddings`:

```bash
curl http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Your text string goes here"
  }'
```

**Response Format:**
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.1234, -0.5678, 0.9012, ...]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 6,
    "total_tokens": 6
  }
}
```

**Key Features:**
- **Deterministic**: Same input always produces identical embeddings
- **Multiple Inputs**: Supports arrays of strings with proper indexing
- **Configurable Dimensions**: Set via `EMBEDDING_DIMENSION` env var or request parameter
- **Model-Sensitive**: Different models produce different embeddings for same input
- **OpenAI Compatible**: Response shape matches OpenAI embeddings API exactly

**Multiple Inputs Example:**
```bash
curl http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-ada-002",
    "input": ["First text", "Second text", "Third text"]
  }'
```

Returns multiple embeddings with indices 0, 1, 2 respectively.

**Note**: The embedding vectors are mock data (deterministic pseudo-random values) that provide the correct shape and behavior for development, but are not real semantic embeddings.

### Client Configuration Example  

If using LangChain (for example), you can either use the inbuilt fake embeddings object:

```javascript
import { FakeEmbeddings } from 'langchain/embeddings/fake';
```

OR you can use the mock server embeddings during development work.  For example using code such as:

```javascript
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

// Custom embeddings class that calls the fake embedding API
class FakeEmbeddingsAPI {
    async embedDocuments(texts: string[]): Promise<number[][]> {
        const embeddings = await Promise.all(
            texts.map(text => this.embedQuery(text))
        );
        return embeddings;
    }
// Custom embeddings class that calls the fake embedding API
    async embedQuery(text: string): Promise<number[]> {
        try {
            const response = await fetch(`${process.env.DEV_EMBEDDING_URL}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-ada-002'
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.data[0].embedding;
        } catch (error) {
            console.error('Error calling fake embedding API:', error);
            throw new Error(`Failed to get embeddings from fake API: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

// Configure model with conditional baseURL
const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  configuration:
    process.env.DEV_MODE === 'true'
      ? {
          baseURL: process.env.DEV_BASE_URL, // http://localhost:8001/chatgpt
        }
      : {},
});

// Create embeddings object and use a fake one if dev mode is set to true to prevent cost of using OpenAI

    let embeddings;

    if (process.env.DEV_MODE === 'true') {
        embeddings = new FakeEmbeddingsAPI();
        console.log(
            `WARNING: DEV MODE IS ON. Using fake embeddings API on ${process.env.DEV_EMBEDDING_URL} and localhost mock server on ${process.env.DEV_BASE_URL}`,
        );
    } else {
        embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
    }
```
then continue to chatbot implementation as normal ...

#### Environment Variables

```bash
# Development mode
DEV_MODE=true
DEV_BASE_URL=http://localhost:8001/chatgpt
DEV_EMBEDDING_URL=http://localhost:8001/v1/embeddings

# Production mode
DEV_MODE=false
```

Setting `DEV_MODE` to false will enable real requests to production LLM services.

**Embeddings Integration**: When `DEV_MODE=true`, the OpenAIEmbeddings client will automatically use the mock `/v1/embeddings` endpoint, providing deterministic mock embeddings for development and testing.

## Supporting Different LLM Providers

Add support for any OpenAI-style API by creating request/response templates:

### OpenAI-Style API Compatibility

This mock server supports any LLM provider that uses the OpenAI chat completion API format, including:

- **ChatGPT** (OpenAI)
- **Grok** (xAI)
- **Llama** (Meta)
- **DeepSeek**
- **Mistral**
- **Claude** (Anthropic)
- **Gemini** (Google)
- And any other OpenAI-compatible API

The default configuration uses the OpenAI chat completion format, which works with most modern LLM providers. You can customize the request/response templates to match specific provider requirements.

### Creating Custom Templates

If you need to support a provider with different request/response formats, create custom templates:

### Step 1: Create Request Template

Create `request-templates/<LLM_NAME>_req.json` with the expected request format:

```json
{
  "model": "string",
  "messages": [
    {
      "role": "string",
      "content": "string"
    }
  ]
}
```

### Step 2: Create Response Template

Create `response-templates/<LLM_NAME>_res.json` with the response structure. Use `DYNAMIC_CONTENT_HERE` as a placeholder for generated content:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "DYNAMIC_CONTENT_HERE"
      },
      "finish_reason": "stop"
    }
  ]
}
```

The `DYNAMIC_CONTENT_HERE` placeholder is where lorem ipsum or stored responses will be injected into the response object.

### Step 3: Configure Environment

Update `.env` with your LLM name and endpoint:

```bash
LLM_URL_ENDPOINT=models/gemini-pro:generateContent
LLM_NAME=gemini
VALIDATE_REQUESTS=true
```

### Example: Google Gemini

Example configuration files for Gemini are included in the repository. Set up with:

```bash
LLM_URL_ENDPOINT=models/gemini-pro:generateContent
LLM_NAME=gemini
VALIDATE_REQUESTS=true
```

Access at: `http://localhost:8001/models/gemini-pro:generateContent`

Any LLM framework that supports OpenAI-style APIs (such as LangChain) can be updated to use this endpoint following the same pattern as the example above.

## Debugging

Enable detailed logging to console to troubleshoot issues:

```bash
# Enable debug mode
DEBUG=*

# Disable debug mode
DEBUG=false
```

Debug mode displays:
- Incoming request details
- Request validation results
- Response generation process
- Timing information
- Applied response delays

## Development Workflow

### Recommended Development Flow

1. **Start with lorem responses and no delays** for rapid UI development:
   ```bash
   MOCK_LLM_RESPONSE_TYPE=lorem
   RESPONSE_DELAY_MIN=0
   RESPONSE_DELAY_MAX=0
   ```

2. **Add response delays** to test loading states and spinners:
   ```bash
   RESPONSE_DELAY_MIN=500
   RESPONSE_DELAY_MAX=1500
   ```

3. **Test with varied latency** to ensure robust error handling:
   ```bash
   RESPONSE_DELAY_MIN=100
   RESPONSE_DELAY_MAX=5000
   ```

4. **Switch to stored responses** for realistic content testing:
   ```bash
   MOCK_LLM_RESPONSE_TYPE=stored
   # Add domain-specific responses to src/data/data.json
   ```

5. **Enable streaming** to test real-time response handling:
   ```bash
   STREAM=true
   # Test your client's streaming response parsing
   ```

6. **Enable validation** before deploying to production:
   ```bash
   VALIDATE_REQUESTS=true
   LOG_REQUESTS=true
   ```

7. **Test with production LLM** by setting `DEV_MODE=false`

### Testing Different Scenarios

The mock server enables comprehensive testing:

- **Loading indicators**: Use response delays to test loading states
- **Timeout handling**: Set high delay values to test timeout logic
- **Error handling**: Modify response templates to return errors
- **Variable content**: Use lorem or multiple stored responses
- **Streaming responses**: Enable `STREAM=true` to test real-time response parsing
- **Offline development**: Work without internet connectivity
- **Cost-free prototyping**: Test UI/UX without API charges

## Project Structure

```
llm-mock/
├── src/
│   ├── data/
│   │   └── data.json              # Stored responses
│   ├── request-templates/          # OpenAI-style request format templates
│   │   ├── openai_req.json         # Default OpenAI chat completion format
│   │   └── gemini_req.json         # Gemini-specific format example
│   ├── response-templates/         # OpenAI-style response format templates
│   │   ├── openai_res.json         # Default OpenAI chat completion response
│   │   └── gemini_res.json         # Gemini-specific response example
│   └── ...
├── .env                            # Configuration
├── .env.chatgpt                    # ChatGPT/OpenAI preset
├── .env.gemini                     # Gemini preset
├── .env.streaming                  # Streaming mode preset
├── docker-compose.yml
└── package.json
```

## Troubleshooting

### Common Issues

**Server not responding:**

Check server is up and running on correct port set in `.env` E.g http://localhost:8001

![LLM Mock Server Page](images/server-page-err.png)

**Port already in use:**
```bash
# Change port in .env
SERVER_PORT=8002
```

**Validation failures:**
- Check your request template matches your LLM's API format
- Review logs at `http://localhost:8001/logs`
- Ensure `LLM_NAME` matches template filenames

**Response delays not working:**
- Verify both `RESPONSE_DELAY_MIN` and `RESPONSE_DELAY_MAX` are set
- Check that values are greater than 0
- Restart the server after changing environment variables

**Docker issues:**
```bash
# Complete cleanup and rebuild
npm run nuke
npm install
npm start
```

## Contributing

Contributions are welcome! This project is built on the [mock-api-framework-template](https://github.com/piyook/mock-api-framework-template).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Related Projects

- [mock-api-framework-template](https://github.com/piyook/mock-api-framework-template) - General mock API framework
- [Fastify](https://www.fastify.io/) - Fast and low overhead web framework

---

**Topics:** mock-server, openai-api, llm, chat-completions, langchain, local-development-environment, streaming-api