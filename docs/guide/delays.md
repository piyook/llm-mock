# Response delays

Simulate realistic API latency to test loading states, timeout handling, and UX. In the preset in `.llmockrc.json`:

```json
{
  "responseDelay": { "min": 800, "max": 2500 }
}
```

The server picks a random value in the range for each request. Set both values to `0` for instant responses. For one run, use `--delayMin` and `--delayMax`; to change it from a test, use [`PATCH /admin/delay`](/reference/admin-api#chaos-delay-and-reply-settings).

| Profile | min | max |
|---|---|---|
| Instant (development) | 0 | 0 |
| Fast | 100 | 300 |
| Realistic production | 800 | 2500 |
| Slow / timeout testing | 3000 | 8000 |
| Fixed delay | 1000 | 1000 |

With [chaos mode](/guide/chaos) on, the delay runs first and then the error is sent.
