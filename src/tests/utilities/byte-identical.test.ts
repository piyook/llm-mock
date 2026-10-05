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
		expect(captured[name].headers).toEqual(reference[name].headers);
	});
});
