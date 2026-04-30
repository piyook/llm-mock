# Local Mock LLM API Framework

[![GitHub Release](https://img.shields.io/github/v/release/piyook/llmock)](https://github.com/piyook/llmock/releases)
[![tests workflow](https://github.com/piyook/llmock/actions/workflows/tests.yaml/badge.svg)](https://github.com/piyook/llmock/actions/workflows/tests.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/llmock)](https://www.npmjs.com/package/llmock)

## Table of Contents

- [Overview](#overview)
- [Why Use LLM Mock?](#why-use-llmock)
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
- [Usage Examples](#usage-examples)
- [Configuration](#configuration-1)
- [Troubleshooting](#troubleshooting)
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

The framework uses a template-based approach where request/response pairs are defined as JSON templates, allowing for easy customization and support for different LLM providers. The server is built with Fastify and provides a RESTful API that can be seamlessly integrated into existing applications.

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
- npm or compatible package manager

## Installation

Install the package globally or locally in your project:

```bash
# Install globally for system-wide usage
npm install -g llmock

# Install locally in your project
npm install llmock
```

## Quick Start

### Configuration System

The LLM Mock Framework uses a centralized configuration file `.llmockrc.json` to manage all model presets and settings.

#### Available Models

The framework includes several pre-configured model presets:

- **chatgpt**: OpenAI ChatGPT-style API (default)
- **gemini**: Google Gemini API format
- **streaming**: OpenAI-style with streaming responses enabled
- **embeddings**: Optimized for embeddings testing with minimal delays

### Starting the Server

#### Using CLI (Recommended)

The LLM Mock Server can be used as an npm package that works both locally and globally. When installed globally, it provides sensible defaults and works without any configuration file.

##### Installation

```bash
# Install globally
npm install -g llmock

# Install locally in your project
npm install llmock
```

##### Basic Usage

```bash
# Start with default settings (chatgpt model, port 8001)
llmock start

# Use specific model preset
llmock start --model=gemini
llmock start --model=streaming
llmock start --model=embeddings

# Stop the server
llmock stop
llmock stop --port=3000  # Stop server on specific port

# Show help
llmock help

# Show current configuration
llmock config
```

##### Command Line Options

All options support both `--key=value` and `--key value` formats:

```bash
# Server Configuration
llmock start --port=3000 --host=localhost
llmock start --endpoint=custom/path

# Stop Command
llmock stop --port=3000  # Stop server on specific port
llmock stop --port 8080   # Alternative format

# Model Settings
llmock start --responseType=static --maxLoremParas=12

# Feature Flags
llmock start --debug=true --stream=true
llmock start --validateRequests=false --logRequests=true

# Response Timing
llmock start --delayMin=1000 --delayMax=2000

# Embeddings
llmock start --embeddings=true --embeddingDimensions=256
```

##### Help and Configuration

```bash
# Show all available options
llmock help

# Show current configuration including custom settings
llmock config

# Combine multiple options
llmock start --model=gemini --port=3000 --debug=true --stream=true
```

##### Configuration File

For advanced configuration, you can create a `.llmockrc.json` file in your project directory:

```bash
# Use configuration file with CLI overrides
llmock start --port=3000 --debug=true
```

#### Available Model Presets

- **chatgpt**: OpenAI ChatGPT-style API (default)
- **gemini**: Google Gemini API format  
- **streaming**: OpenAI-style with streaming responses enabled
- **embeddings**: Optimized for embeddings testing with minimal delays

This starts the mock server locally with the built-in web dashboard.

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

## Request Logging

When logging is enabled (`--logRequests=true`), API requests are automatically saved to your system's standard log location:

- **Windows**: `C:\Users\{name}\AppData\Local\llmock-nodejs\Log\`
- **macOS**: `~/Library/Logs/llmock-nodejs/`
- **Linux**: `~/.local/share/llmock-nodejs/log/`

View logs in real-time at `http://localhost:8001/logs` or find the `api_request_log.json` file in the locations above.

**Quick Commands:**
- `llmock start --logRequests=true` - Start server with logging enabled
- `llmock stop` - Stop the server
- `llmock stop --port=3000` - Stop server on specific port

## Configuration

### Configuration File (.llmockrc.json)

The LLM Mock Framework uses a centralized configuration file `.llmockrc.json` to manage all settings and model presets.

#### Configuration Structure

```json
{
  "defaultModel": "chatgpt",
  "models": {
    "chatgpt": {
      "name": "openai",
      "model": "gpt-4o",
      "endpoint": "chatgpt/chat/completions",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "logRequests": true,
      "debug": false,
      "stream": false,
      "responseDelay": {
        "min": 3000,
        "max": 5000
      },
      "embeddings": {
        "enabled": true,
        "dimensions": 128
      }
    }
  },
  "server": {
    "port": 8001,
    "host": "0.0.0.0"
  }
}
```

#### Configuration Options

**Server Settings:**
- `port`: Server port (default: 8001)
- `host`: Server host (default: "0.0.0.0")

**Model Settings:**
- `name`: LLM provider name (used for template loading)
- `model`: Model identifier (e.g., "gpt-4o", "gemini-pro")
- `endpoint`: API endpoint path
- `responseType`: "lorem" or "stored"
- `maxLoremParas`: Maximum sentences for lorem ipsum responses
- `validateRequests`: Enable request validation
- `logRequests`: Enable request logging
- `debug`: Enable debug logging
- `stream`: Enable streaming responses
- `responseDelay.min/max`: Response delay range in milliseconds
- `embeddings.enabled`: Enable embeddings endpoint
- `embeddings.dimensions`: Embedding vector dimensions

#### Adding Custom Models

You can add new model presets by extending the `models` object:

```json
{
  "models": {
    "my-custom-model": {
      "name": "openai",
      "model": "gpt-3.5-turbo",
      "endpoint": "api/v1/chat/completions",
      "responseType": "stored",
      "maxLoremParas": 5,
      "validateRequests": true,
      "logRequests": false,
      "debug": true,
      "stream": false,
      "responseDelay": {
        "min": 1000,
        "max": 2000
      },
      "embeddings": {
        "enabled": false,
        "dimensions": 64
      }
    }
  }
}
```

Then start the server with your custom model:

```bash
npm run llmock -- --model=my-custom-model
```

#### Embeddings Configuration

Enable and configure the mock embeddings endpoint in your model configuration:

```json
{
  "embeddings": {
    "enabled": true,
    "dimensions": 128
  }
}
```

#### Streaming Responses

Enable OpenAI-style Server-Sent Events (SSE) streaming for chat-completion responses:

```json
{
  "stream": true
}
```

**How Streaming Works:**

- **`stream: true`**: Returns OpenAI-style SSE stream with `chat.completion.chunk` events
- **`stream: false`**: Returns standard single JSON response (existing behavior)
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

```json
{
  "responseDelay": {
    "min": 500,
    "max": 2000
  }
}
```

**How Response Delays Work:**

- The mock server randomly selects a delay between `min` and `max` for each request
- Delays are applied to both GET and POST endpoints in completions API
- When both values are `0`, responses are returned immediately (backward compatible with previous versions)
- Helps test loading indicators, timeout handling, and user experience with real-world latency

**Delay Configuration Examples:**

```json
// No delay - instant responses
{
  "responseDelay": {
    "min": 0,
    "max": 0
  }
}

// Fast responses (for rapid development)
{
  "responseDelay": {
    "min": 100,
    "max": 300
  }
}

// Realistic production-like latency
{
  "responseDelay": {
    "min": 800,
    "max": 2500
  }
}

// Test slow network conditions
{
  "responseDelay": {
    "min": 3000,
    "max": 8000
  }
}

// Fixed delay (same min/max)
{
  "responseDelay": {
    "min": 1000,
    "max": 1000
  }
}
```

### Custom API Paths

You can customize endpoints in your model configuration to match your LLM provider's path structure:

```json
{
  "endpoint": "chatgpt/chat/completions"
}
```

**Example Configurations:**

**ChatGPT Format:**
```json
{
  "endpoint": "chatgpt/chat/completions"
}
```
Access at: `http://localhost:8001/chatgpt/chat/completions`

**Gemini Format:**
```json
{
  "endpoint": "models/gemini-pro:generateContent"
}
```
Access at: `http://localhost:8001/models/gemini-pro:generateContent`

## Features

### Available Endpoints

The mock server provides the following OpenAI-style endpoints:

- **Chat Completions**: Configurable endpoint path (default: `/chatgpt/chat/completions`)
- **Embeddings**: `/v1/embeddings` (OpenAI-compatible embeddings endpoint)

View all available endpoints by visiting:

```
http://localhost:8001
```

### Response Types

#### 1. Lorem Ipsum Responses

Generate random placeholder text for testing:

```json
{
  "responseType": "lorem",
  "maxLoremParas": 8
}
```

Generates up to 8 random sentences per response. Perfect for testing UI rendering with variable content lengths.

#### 2. Stored Responses

Use predefined responses from `src/data/data.json`:

```json
{
  "responseType": "stored"
}
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
2. Enable validation in your model configuration:

```json
{
  "validateRequests": true
}
```

Invalid requests return detailed error messages explaining the format mismatch.

### Request Logging

Debug your LLM interactions by logging all requests:

1. Enable logging in your model configuration:

```json
{
  "logRequests": true,
  "validateRequests": true
}
```

2. View logged requests at:

```
http://localhost:8001/logs
```

Displays detailed information about each request including headers, body, and validation status.

## Integration Guide

### Using with LangChain and OpenAI-Style APIs

Configure your endpoint in the model configuration to match the OpenAI chat completion format:

```json
{
  "endpoint": "chatgpt/chat/completions"
}
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

#### Streaming Mode

Enable streaming in your model configuration:

```json
{
  "stream": true
}
```

Then use the same endpoint:

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

**Note:** The request payload is identical in both modes. The difference is in the server-side response framing, controlled by the `stream` configuration setting.

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
- **Configurable Dimensions**: Set via `embeddings.dimensions` in model configuration or request parameter
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

**Note**: The embedding vectors are mock data (deterministic pseudo-random values) that provide the correct shape and behavior for testing, but are not real semantic embeddings.

### Client Configuration Example  

If using LangChain (for example), you can either use the inbuilt fake embeddings object:

```javascript
import { FakeEmbeddings } from 'langchain/embeddings/fake';
```

Alternatively, you can use the mock server embeddings for testing. For example:

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
    process.env.TEST_MODE === 'true'
      ? {
          baseURL: process.env.TEST_BASE_URL, // http://localhost:8001/chatgpt
        }
      : {},
});

// Create embeddings object and use a fake one if test mode is set to true to prevent cost of using OpenAI

    let embeddings;

    if (process.env.TEST_MODE === 'true') {
        embeddings = new FakeEmbeddingsAPI();
        console.log(
            `WARNING: TEST MODE IS ON. Using fake embeddings API on ${process.env.TEST_EMBEDDING_URL} and localhost mock server on ${process.env.TEST_BASE_URL}`,
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
# Testing mode (using mock server)
TEST_MODE=true
TEST_BASE_URL=http://localhost:8001/chatgpt
TEST_EMBEDDING_URL=http://localhost:8001/v1/embeddings

# Production mode (using real LLM services)
TEST_MODE=false

Setting `TEST_MODE` to false will enable real requests to production LLM services.

**Embeddings Integration**: When `TEST_MODE=true`, the OpenAIEmbeddings client will automatically use the mock `/v1/embeddings` endpoint, providing deterministic mock embeddings for testing.

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

The LLM Mock Framework automatically searches for templates in two locations:
1. **Current working directory** (where you run `llmock`) - `./request-templates/` and `./response-templates/`
2. **Default source directory** - `src/request-templates/` and `src/response-templates/`

This allows you to create project-specific templates without modifying the core framework.

#### Local Template Setup (Recommended)

Create custom templates in your project directory:

```
your-project/
├── .llmockrc.json           # Your configuration
├── request-templates/       # Custom request templates
│   ├── mymodel_req.json
│   └── another_req.json
└── response-templates/      # Custom response templates
    ├── mymodel_res.json
    └── another_res.json
```

### Step 1: Create Request Template

Create `request-templates/<LLM_NAME>_req.json` in your project directory with the expected request format:

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

Create `response-templates/<LLM_NAME>_res.json` in your project directory with the response structure. Use `DYNAMIC_CONTENT_HERE` as a placeholder for generated content:

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

### Step 3: Configure Model

Add your custom model to `.llmockrc.json`:

```json
{
  "defaultModel": "mymodel",
  "models": {
    "mymodel": {
      "name": "mymodel",
      "model": "my-custom-model-v1",
      "endpoint": "api/v1/chat/completions",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "logRequests": true,
      "debug": false,
      "stream": false,
      "responseDelay": {
        "min": 1000,
        "max": 2000
      },
      "embeddings": {
        "enabled": true,
        "dimensions": 128
      }
    }
  },
  "server": {
    "port": 8001,
    "host": "0.0.0.0"
  }
}
```

### Step 4: Start Server

Run llmock from your project directory:

```bash
# Start with your custom model
llmock start --model=mymodel

# Or use CLI overrides
llmock start --model=mymodel --port=3000 --debug=true
```

### Complete Example: Custom Model Setup

Here's a complete example of setting up a custom model called "myllm":

#### Directory Structure:
```
trial/
├── .llmockrc.json
├── request-templates/
│   └── myllm_req.json
└── response-templates/
    └── myllm_res.json
```

#### Configuration (.llmockrc.json):
```json
{
  "defaultModel": "chatgpt",
  "models": {
    "chatgpt": { /* ... */ },
    "myllm": {
      "name": "myllm",
      "model": "myllm-1-0",
      "endpoint": "myllm/chat/completions",
      "responseType": "lorem",
      "maxLoremParas": 8,
      "validateRequests": true,
      "logRequests": true,
      "debug": false,
      "stream": false,
      "responseDelay": {
        "min": 1000,
        "max": 2000
      },
      "embeddings": {
        "enabled": true,
        "dimensions": 128
      }
    }
  },
  "server": {
    "port": 8001,
    "host": "0.0.0.0"
  }
}
```

#### Request Template (request-templates/myllm_req.json):
```json
[
  {
    "model": "myllm-1-0",
    "max_tokens": 256,
    "temperature": 1,
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Your message here"
          }
        ]
      }
    ],
    "stream": false
  }
]
```

#### Response Template (response-templates/myllm_res.json):
```json
[
  {
    "id": "msg_01JABCDEFG23456789XYZ",
    "type": "message",
    "model": "myllm-3-5-sonnet-20240620",
    "role": "assistant",
    "created_at": "2024-06-20T12:34:56Z",
    "usage": {
      "input_tokens": 12,
      "output_tokens": 99
    },
    "content": [
      {
        "type": "text",
        "text": "DYNAMIC_CONTENT_HERE"
      }
    ],
    "stop_reason": "end_turn",
    "stop_sequence": null
  }
]
```

#### Usage:
```bash
# Run from the trial/ directory
cd trial
llmock start --model=myllm

# Make requests matching the template
curl -N http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "myllm-3-5-sonnet-20240620",
    "max_tokens": 256,
    "temperature": 1,
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Hello!"
          }
        ]
      }
    ],
    "stream": false
  }'
```

### Example: Google Gemini

For Gemini support, configure your settings as follows:

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

## Usage Examples

### Basic Testing Workflow

1. **Start with instant responses** for rapid UI development:
   ```bash
   llmock start --delayMin=0 --delayMax=0
   ```

2. **Add realistic delays** to test loading states:
   ```bash
   llmock start --delayMin=500 --delayMax=1500
   ```

3. **Test streaming responses** for real-time applications:
   ```bash
   llmock start --model=streaming
   ```

4. **Test embeddings** for vector search applications:
   ```bash
   llmock start --model=embeddings
   ```

### Advanced Testing

The mock server enables comprehensive testing scenarios:

- **Loading indicators**: Use response delays to test loading states
- **Timeout handling**: Set high delay values to test timeout logic
- **Error handling**: Modify response templates to simulate errors
- **Variable content**: Use lorem or multiple stored responses
- **Streaming responses**: Enable streaming to test real-time response parsing
- **Offline testing**: Work without internet connectivity
- **Cost-free prototyping**: Test UI/UX without API charges

## Configuration

The server can be configured using:

1. **Command line options** - Quick overrides for common settings
2. **Configuration file** - `.llmockrc.json` for persistent settings
3. **Environment variables** - For CI/CD and automation

### Quick Configuration Examples

```bash
# Fast responses for development
llmock start --delayMin=0 --delayMax=0

# Realistic API timing
llmock start --delayMin=800 --delayMax=2500

# Enable request logging
llmock start --logRequests=true

# Custom port and host
llmock start --port=3000 --host=localhost
```

## Troubleshooting

### Common Issues

**Server not responding:**

Check server is up and running on correct port configured in `.llmockrc.json` E.g http://localhost:8001

![LLM Mock Server Page](images/server-page-err.png)

**Port already in use:**
```json
// Change port in .llmockrc.json
{
  "server": {
    "port": 8002
  }
}
```

**Validation failures:**
- Check your request template matches your LLM's API format
- Review logs at `http://localhost:8001/logs`
- Ensure `LLM_NAME` matches template filenames

**Response delays not working:**
- Verify both `responseDelay.min` and `responseDelay.max` are set in your model configuration
- Check that values are greater than 0
- Restart the server after changing configuration


## Contributing

Contributions are welcome! This project is built on the [mock-api-framework-template](https://github.com/piyook/mock-api-framework-template).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Related Projects

- [mock-api-framework-template](https://github.com/piyook/mock-api-framework-template) - General mock API framework
- [Fastify](https://www.fastify.io/) - Fast and low overhead web framework

---

**Topics:** mock-server, openai-api, llm, chat-completions, langchain, local-development-environment, streaming-api