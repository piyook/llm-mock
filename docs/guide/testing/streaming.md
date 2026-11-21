# Streaming API Testing Guide

This guide provides manual testing steps for the streaming functionality of the mock LLM API.

## Overview

The mock LLM API supports two response modes:
- **Static Mode**: Returns a single JSON response
- **Streaming Mode**: Returns OpenAI-style Server-Sent Events (SSE) stream

With the `openai` format the request picks the mode, as with the real API: `"stream": true` in the body streams and `"stream": false` does not. A request with no `stream` key (or a GET) uses the server setting (`STREAM=true` / `false`, or the preset's `stream`). The `gemini` format always uses the server setting.

## Quick Setup

### 1. Enable Streaming Mode

Edit your `.env` file:
```bash
STREAM=true
```

Or use the provided streaming configuration:
```bash
cp .env.streaming .env
```

### 2. Start the Server

```bash
npm run dev
# or for streaming-specific config:
npm run serve:streaming
```

The server will start on `http://localhost:8001`

## Manual Testing

### Static Mode Testing

1. **Send `"stream": false`** (or set STREAM=false and leave `stream` out of the request)
2. **Make a request**:
```bash
curl -X POST http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello world"}],
    "temperature": 1,
    "n": 1,
    "stream": false
  }'
```

3. **Expected Response**: Single JSON object
```json
{
  "id": "chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe",
  "object": "chat.completion",
  "created": 1678485525,
  "model": "gpt-4o",
  "usage": {
    "prompt_tokens": 11,
    "completion_tokens": 9,
    "total_tokens": 20
  },
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Generated response content here..."
    },
    "finish_reason": "stop",
    "index": 0
  }]
}
```

### Streaming Mode Testing

1. **Send `"stream": true`** (or set STREAM=true and leave `stream` out of the request)
2. **Make the request**:
```bash
curl -N -X POST http://localhost:8001/chatgpt/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello world"}],
    "temperature": 1,
    "n": 1,
    "stream": true
  }'
```

3. **Expected Response**: Multiple SSE events
```
data: {"id":"chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe-0","object":"chat.completion.chunk","created":1678485525,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe-1","object":"chat.completion.chunk","created":1678485525,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe-2","object":"chat.completion.chunk","created":1678485525,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}

data: {"id":"chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe-final","object":"chat.completion.chunk","created":1678485525,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

`model` echoes the request's `model` (the preset's `model` if the request has none) and `usage` is an estimate (about 4 characters per token). To get usage on a stream, send `"stream_options": {"include_usage": true}`, as with the OpenAI API: every chunk then carries `"usage": null`, and one more chunk with `"choices": []` and the estimated `usage` comes just before `data: [DONE]`:

```
data: {"id":"chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe-usage","object":"chat.completion.chunk","created":1678485525,"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}}
```

## Response Headers Verification

### Static Mode Headers
```http
Content-Type: application/json
```

### Streaming Mode Headers
```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Cache-Control
```

## Testing Scenarios

### 1. Basic Functionality
- Verify static mode returns single JSON
- Verify streaming mode returns multiple SSE events
- Check that both modes use the same endpoint URL

### 2. Content Validation
- Compare content between static and streaming modes
- Ensure streaming chunks reconstruct the same content as static response
- Verify first chunk contains role information
- Verify final chunk has `finish_reason: "stop"` and empty delta

### 3. Format Compliance
- Validate static response matches OpenAI chat.completion schema
- Validate streaming chunks match OpenAI chat.completion.chunk schema
- Ensure last line is always `data: [DONE]`

### 4. Error Handling
- Test with invalid requests (should return 400 error in both modes)
- Test with missing required fields
- Verify error responses are not streamed

### 5. Performance Testing
- Test response delays with different `RESPONSE_DELAY_MIN/MAX` values
- Verify streaming delays are distributed across chunks
- Test with very long responses (multiple chunks)

## Automated Testing

### Unit Tests
```bash
npm run test:unit
```

### E2E Tests
```bash
# Test all endpoints including streaming
npm run test:e2e

# Test only streaming
npm run test:streaming
```

### Cypress Tests
```bash
# Open Cypress UI
npm run cypress:open

# Run streaming tests specifically
npm run test:streaming
```

## Troubleshooting

### Common Issues

1. **No response received**
   - Check server is running: `curl http://localhost:8001`
   - Verify port in `.env` matches `SERVER_PORT`
   - Check for console errors

2. **Invalid request errors**
   - Ensure all required fields are present: `model`, `messages`
   - Check request format matches `openai_req.json` template
   - Verify `VALIDATE_REQUESTS=ON` if validation is expected

3. **Streaming not working**
   - Check the request doesn't send `"stream": false` (it wins over the server setting)
   - Confirm `STREAM=true` in `.env` if the request has no `stream` key
   - Restart server after changing environment variables
   - Check response headers include `text/event-stream`

4. **Content differences between modes**
   - Both modes should generate the same base content
   - Differences may occur due to random content generation
   - Set `MOCK_LLM_RESPONSE_TYPE=stored` for consistent content

### Debug Mode

Enable detailed logging:
```bash
DEBUG=*
```

### Request Logging

View detailed request information:
```bash
LOG_REQUESTS=ON
VALIDATE_REQUESTS=ON
```

Then open the dashboard at `http://localhost:8001` and click **View request log**

## Integration Examples

### JavaScript/Fetch
```javascript
// Static mode
const response = await fetch('http://localhost:8001/chatgpt/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: 1,
    n: 1,
    stream: false
  })
});
const result = await response.json();
console.log(result);

// Streaming mode
const response = await fetch('http://localhost:8001/chatgpt/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: 1,
    n: 1,
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        console.log('Stream completed');
        return;
      }
      const parsed = JSON.parse(data);
      console.log('Chunk:', parsed);
    }
  }
}
```

### Python
```python
import requests

# Static mode
response = requests.post(
    'http://localhost:8001/chatgpt/chat/completions',
    json={
        'model': 'gpt-4o',
        'messages': [{'role': 'user', 'content': 'Hello'}],
        'temperature': 1,
        'n': 1,
        'stream': False
    }
)
print(response.json())

# Streaming mode
response = requests.post(
    'http://localhost:8001/chatgpt/chat/completions',
    json={
        'model': 'gpt-4o',
        'messages': [{'role': 'user', 'content': 'Hello'}],
        'temperature': 1,
        'n': 1,
        'stream': True
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        decoded = line.decode('utf-8')
        if decoded.startswith('data: '):
            data = decoded[6:]  # Remove 'data: ' prefix
            if data == '[DONE]':
                print('Stream completed')
                break
            import json
            chunk = json.loads(data)
            print('Chunk:', chunk)
```
