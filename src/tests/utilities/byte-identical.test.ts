import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import {
	captureReplies,
	type CapturedReply,
} from '../golden/capture-replies.js';

const require = createRequire(import.meta.url);
const reference: Record<
	string,
	CapturedReply
> = require('../golden/replies-3.9.0.json');

// Headers that differ from 3.9.0 on purpose. Up to 3.13.0 the openai-format
// stream (used by the openai and gemini presets) was sent with no headers at
// all: they were set on the Fastify reply but the stream is written to the raw
// response. These are the headers it has been sent with since that fix.
const fixedStreamHeaders = {
	'content-type': 'text/event-stream',
	'cache-control': 'no-cache',
	'access-control-allow-origin': '*',
};
const changedHeaders: Record<string, Record<string, unknown>> = {
	'openai streamed': fixedStreamHeaders,
	'gemini streamed': fixedStreamHeaders,
};

// A config written for 3.9.0 (a rule with no stopReason, chaos with no kind)
// must get the same bytes back as it did then. The reference was captured by
// running capture-replies.ts on a 3.9.0 checkout.
describe('replies to a 3.9.0 config are byte-identical to 3.9.0', async () => {
	const captured = await captureReplies();

	test('covers every reference reply', () => {
		expect(Object.keys(captured)).toEqual(Object.keys(reference));
	});

	test.each(Object.keys(reference))('%s', (name) => {
		expect(captured[name].payload).toBe(reference[name].payload);
		expect(captured[name].status).toBe(reference[name].status);
		expect(captured[name].headers).toEqual(
			changedHeaders[name] ?? reference[name].headers,
		);
	});
});
