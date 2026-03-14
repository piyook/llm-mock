export type UiMeta = {
	serverPort: number | null;
	llmUrlEndpoint: string;
	llmName: string;
	llmModel: string;
	mockResponseType: string;
	maxLoremParas: number | null;
	storedResponsesCount: number | null;
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

