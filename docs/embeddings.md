# Embeddings Endpoint Testing Guide

This document provides manual testing steps and examples for the OpenAI-style embeddings endpoint.

## Overview

The mock server provides an embeddings endpoint at `/v1/embeddings` that generates deterministic mock embeddings for development and testing purposes.

## Quick Test Commands

### 1. Basic Single Input Test

```bash
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-ada-002",
    "input": "Hello world"
  }'
```

**Expected Response:**
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
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 2,
    "total_tokens": 2
  }
}
```

### 2. Multiple Inputs Test

```bash
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-ada-002",
    "input": ["First input", "Second input", "Third input"]
  }'
```

**Expected Response:**
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.1234, -0.5678, 0.9012, ...]
    },
    {
      "object": "embedding",
      "index": 1,
      "embedding": [0.2345, -0.6789, 0.0123, ...]
    },
    {
      "object": "embedding",
      "index": 2,
      "embedding": [0.3456, -0.7890, 0.1234, ...]
    }
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 6,
    "total_tokens": 6
  }
}
```

### 3. Custom Dimensions Test

```bash
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-ada-002",
    "input": "Test custom dimensions",
    "dimensions": 256
  }'
```

**Expected Response:**
- Embedding array should have 256 dimensions instead of default 128

### 4. GET Request Test

```bash
curl -X GET "http://localhost:8001/v1/embeddings?model=text-embedding-3-small&input=GET%20test&dimensions=64"
```

**Expected Response:**
- Same format as POST requests
- Uses query parameters instead of JSON body

## Verification Steps

### 1. Verify Response Structure

Check that the response contains:
- ✅ `object: "list"`
- ✅ `data` array with correct length
- ✅ Each data item has `object: "embedding"`, `index`, and `embedding` array
- ✅ `model` field matches request
- ✅ `usage` object with `prompt_tokens` and `total_tokens`

### 2. Verify Determinism

**Test 1: Same Input, Same Model**
```bash
# First request
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "text-embedding-ada-002", "input": "determinism test"}' > response1.json

# Second request  
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "text-embedding-ada-002", "input": "determinism test"}' > response2.json

# Compare (should be identical)
diff response1.json response2.json
```

**Expected:** No differences between files

**Test 2: Different Inputs**
```bash
# Request with different input
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "text-embedding-ada-002", "input": "different input"}' > response3.json

# Compare (should be different)
diff response1.json response3.json
```

**Expected:** Files should be different

**Test 3: Different Models, Same Input**
```bash
# Request with different model
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "text-embedding-3-small", "input": "determinism test"}' > response4.json

# Compare (should be different)
diff response1.json response4.json
```

**Expected:** Files should be different

### 3. Verify Error Handling

**Invalid Request (Missing Model):**
```bash
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": "missing model"}'
```

**Expected Response:**
- Status: 400
- Error message about invalid request format

**Invalid Request (Missing Input):**
```bash
curl -X POST http://localhost:8001/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "text-embedding-ada-002"}'
```

**Expected Response:**
- Status: 400
- Error message about invalid request format

### 4. Verify Configuration

**Check UI Dashboard:**
1. Visit `http://localhost:8001`
2. Verify "Embeddings Status" shows "ENABLED" or "DISABLED"
3. Verify "Embedding Dimensions" shows the configured value
4. Verify "/v1/embeddings" appears in API links when enabled

**Test Environment Variables:**
```bash
# Disable embeddings
echo "ENABLE_EMBEDDINGS_MOCK=false" > .env.test
# Restart server and verify endpoint returns 404

# Change dimensions
echo "EMBEDDING_DIMENSION=64" > .env.test  
# Restart server and verify embeddings have 64 dimensions
```

## Integration Testing

### With OpenAI Client Libraries

**JavaScript/Node.js:**
```javascript
import { OpenAI } from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:8001/v1',
  apiKey: 'sk-mock-key' // Mock key for development
});

const response = await openai.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'Your text here'
});

console.log(response.data[0].embedding); // Should be array of numbers
```

**Python:**
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8001/v1",
    api_key="sk-mock-key"
)

response = client.embeddings.create(
    model="text-embedding-ada-002",
    input="Your text here"
)

print(response.data[0].embedding)  # Should be array of numbers
```

### With LangChain

```javascript
import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: 'sk-mock-key',
  modelName: 'text-embedding-ada-002',
  configuration: {
    baseURL: 'http://localhost:8001/v1',
  },
});

const result = await embeddings.embedQuery("Hello world");
console.log(result); // Should be array of numbers
```

## Performance and Limits

- **Default Dimensions:** 128 (configurable via `EMBEDDING_DIMENSION`)
- **Custom Dimensions:** Supported up to reasonable limits (tested up to 2048)
- **Multiple Inputs:** Supports arrays, tested up to 10 inputs
- **Response Time:** Fast (mock data, no real computation)
- **Determinism:** Guaranteed for same (model, input) combination

## Troubleshooting

### Common Issues

1. **404 Error:**
   - Check `ENABLE_EMBEDDINGS_MOCK=true` in environment
   - Restart server after changing environment variables

2. **400 Error:**
   - Verify request includes both `model` and `input` fields
   - Check JSON syntax and content-type header

3. **Wrong Dimensions:**
   - Check `EMBEDDING_DIMENSION` environment variable
   - Verify `dimensions` parameter in request

4. **Non-deterministic Results:**
   - Ensure same model and input values
   - Check for hidden characters or whitespace differences

### Debug Commands

```bash
# Check server status
curl http://localhost:8001/ping

# Check UI metadata (includes embeddings status)
curl http://localhost:8001/ui-meta

# Check logs for detailed request information
curl http://localhost:8001/logs
```

## Automated Tests

The project includes comprehensive automated tests:

- **Unit Tests:** `npm run test:unit -- src/tests/utilities/response-helpers-embeddings.test.ts`
- **E2E Tests:** `npm run test:embeddings`
- **All Tests:** `npm run test:e2e` (includes embeddings tests)

Run these commands to verify the implementation works correctly after making changes.
