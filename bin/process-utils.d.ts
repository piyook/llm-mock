export function tsxCliPath(): string;
export function resolveModelName(flagValue: string | undefined, config: { defaultModel?: string }): string;
export function parseListeningPids(netstatOutput: string, port: number | string): string[];
