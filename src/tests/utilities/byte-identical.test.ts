import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import {
	captureReplies,
	type CapturedReply,
} from '../golden/capture-replies.js';
import { estimateOpenAiUsage } from '../../utilities/build-openai-response.js';

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

// Payloads that differ from 3.9.0 on purpose. Up to 3.13.0 the openai format
// always sent model "gpt-3.5-turbo-0301" and usage 12/99/111. Since then it
// echoes the request's model and estimates usage; nothing else changed.
const capturedRequest = {
	messages: [{ role: 'user', content: 'GOLDEN please' }],
};
const oldModel = '"model":"gpt-3.5-turbo-0301"';
const oldUsage =
	'"usage":{"prompt_tokens":12,"completion_tokens":99,"total_tokens":111}';
const withRequestFields = (payload: string): string => {
	const text = (
		JSON.parse(payload) as {
			choices: Array<{ message: { content: string } }>;
		}
	).choices[0].message.content;

	return payload
		.replace(oldModel, '"model":"golden-model"')
		.replace(
			oldUsage,
			`"usage":${JSON.stringify(estimateOpenAiUsage(capturedRequest, text))}`,
		);
};
const changedPayloads: Record<string, (payload: string) => string> = {
	'openai static': withRequestFields,
	'openai streamed': (payload) =>
		payload.replaceAll(oldModel, '"model":"golden-model"'),
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
		const expected = changedPayloads[name]?.(reference[name].payload);
		// The change must apply: the reference still has the old values
		if (expected !== undefined) {
			expect(expected).not.toBe(reference[name].payload);
		}
		expect(captured[name].payload).toBe(
			expected ?? reference[name].payload,
		);
		expect(captured[name].status).toBe(reference[name].status);
		expect(captured[name].headers).toEqual(
			changedHeaders[name] ?? reference[name].headers,
		);
	});
});
