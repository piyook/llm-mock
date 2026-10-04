export type Llm = {
	id: number;
	content: string;
};

export type ToolCall = {
	name: string;
	arguments: Record<string, unknown>;
};

/**
 * What the mock has decided to answer with, before it is shaped into a
 * provider's wire format. Only `text` is produced and used today; the other
 * fields are filled in as rules learn to return them.
 */
export type MockReply = {
	text: string;
	toolCalls?: ToolCall[];
	stopReason?: string;
	error?: { status: number; message?: string };
	/** Id of the response rule that produced this reply, if one matched. */
	ruleId?: string;
};
