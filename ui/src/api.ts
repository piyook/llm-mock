export type UiMeta = {
	version: string | null;
	serverPort: number | null;
	llmUrlEndpoint: string;
	llmName: string;
	llmModel: string;
	mockResponseType: string;
	maxLoremParas: number | null;
	storedResponsesCount: number | null;
	storedResponsesFile: string | null;
	responseRules: Array<{ match: string; files: string[] }>;
	validateRequests: string;
	logRequests: string;
	debugMode: 'ON' | 'OFF';
	responseDelayMinMs: number;
	responseDelayMaxMs: number;
	delayStatus: 'ENABLED' | 'DISABLED';
	streamingStatus: 'ENABLED' | 'DISABLED';
	embeddingsEnabled: 'ENABLED' | 'DISABLED';
	embeddingDimension: number;
	apiLinks: Array<{ href: string; label: string }>;
};

export type StoredResponses = {
	file: string | null;
	responses: string[];
};

export type RuleFile = {
	match: string;
	file: string;
	content: string;
};

export type RequestLog = {
	file: string;
	log: unknown;
};

// The viewer routes answer failures with `{ error }` explaining what is wrong
// with the file, which is more use to the reader than the status code.
async function fetchViewerJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	const body = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(body?.error ?? `${url} failed: ${res.status}`);
	}
	return body as T;
}

export function fetchStoredResponses(): Promise<StoredResponses> {
	return fetchViewerJson('/ui-stored-responses');
}

export function fetchRuleFile(rule: number, file: number): Promise<RuleFile> {
	return fetchViewerJson(`/ui-rule-file?rule=${rule}&file=${file}`);
}

export function fetchRequestLog(): Promise<RequestLog> {
	return fetchViewerJson('/ui-request-log');
}

export async function fetchPing(): Promise<boolean> {
	const res = await fetch('/ping');
	return res.ok;
}

export async function fetchUiMeta(): Promise<UiMeta> {
	const res = await fetch('/ui-meta');
	if (!res.ok) {
		throw new Error(`ui-meta failed: ${res.status}`);
	}
	return (await res.json()) as UiMeta;
}

