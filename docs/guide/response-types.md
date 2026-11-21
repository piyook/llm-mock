# Generated and stored replies

A request that no [response rule](/guide/response-rules) matches gets a reply made up by the preset's `responseType`: generated lorem ipsum, or a text picked from a pool.

## Lorem ipsum

Generates random placeholder text, good for testing variable-length content in the UI. It is the default.

```json
{ "responseType": "lorem", "maxLoremParas": 8 }
```

## Stored responses

Returns one text from a pool, picked at random on each request. Without further settings the pool is a small set of fixed sentences bundled with the package:

```json
{ "responseType": "stored" }
```

### Your own pool

Point `storedResponsesFile` at a JSON file:

```json
{ "responseType": "stored", "storedResponsesFile": "fixtures/replies.json" }
```

The file is a JSON array of strings:

```json
["First canned reply.", "Second canned reply.", "Third canned reply."]
```

## Details

- Entries can also be objects with a string `content`, the shape of the bundled data: `[{ "id": 1, "content": "First canned reply." }]`. Other keys are ignored.
- The path is resolved relative to the folder holding the config file.
- A path that is empty or not a string stops the server at startup. When the response type is `stored`, so does a file that is missing, unreadable, not valid JSON, not an array, an empty array, or that has an entry of any other shape.
- The file is checked at startup and then read again on every request, so you can edit it without restarting. If it becomes invalid while the server is running, requests return an error rather than falling back to the bundled sentences.
- A matching [response rule](/guide/response-rules) still wins. Use rules for a specific reply to a specific request, and stored responses for random variety on everything else.
- Works with every preset and with both static and streamed replies.
- To switch between `lorem` and `stored` on a running server, use [`PATCH /admin/settings`](/reference/admin-api#chaos-delay-and-reply-settings).
