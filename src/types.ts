import type { StopReason } from './utilities/stop-reason.js';
import type { ReplyContentBlock } from './utilities/tool-use.js';

export type Llm = {
	id: number;
	content: string;
};

/**
 * What the mock has decided to answer with, before it is shaped into a
 * provider's wire format.
 */
export type MockReply = {
	text: string;
	// How the reply ends; left out for a reply that ends normally
	stopReason?: StopReason;
	// Content blocks of a tool-call reply (claude format), in place of
	// `text`. Such a reply ends with stop_reason "tool_use".
	content?: ReplyContentBlock[];
};
