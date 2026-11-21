# Failing one prompt

[Chaos mode](/guide/chaos) fails 1 in X calls, whichever they are. To fail one particular prompt and leave the rest alone, give a [response rule](/guide/response-rules) `fail`:

```json
{
  "responseRules": [
    { "match": "Summarise the Q3 report", "fail": { "kind": "stream-error", "status": 529, "afterChunks": 1 } },
    { "match": "Translate this", "fail": { "status": 429 } }
  ]
}
```

Every call that matches the rule fails, whether or not chaos is on. Every other call is untouched, so your tests do not depend on the order the calls arrive in.

## Settings

| `fail` setting | What it does | Default |
|---|---|---|
| `kind` | `"http"`, `"stream-error"`, `"stream-drop"` or `"stream-stall"`, as in [Stream failures](/guide/chaos#stream-failures) | `"http"` |
| `status` | HTTP status of the error, `400` to `599` | `500` |
| `afterChunks` | How many content deltas a failing stream sends first | `2` |

All three settings are optional: `"fail": {}` is an HTTP 500. They are the rule's own; nothing is taken from the preset's `chaos`.

## Details

- The call gets exactly what a failing chaos call of that `kind` gets: the same error bodies, the `x-llmock-chaos: true` header, and the same handling of a call that did not ask for a stream.
- A rule with `fail` needs no `file` or `files`. Add one to choose the text a `stream-*` failure sends before it fails; without one that text is a normal generated reply.
- The rule fails every time, so a client that retries the same prompt fails again. To have a retry succeed, use chaos with `frequency: 2`, or add the rule from a test with [`times: 1`](/reference/admin-api#rules).
- These failures are added to the dashboard's chaos count, but do not shift which of the other calls chaos fails.
- A `fail` that is not valid stops the server at startup.
