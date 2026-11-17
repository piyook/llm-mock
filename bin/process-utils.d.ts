export const DEFAULT_STOP_PORT: number;
export function tsxCliPath(): string;
export function resolveModelName(flagValue: string | undefined, config: { defaultModel?: string }): string;
export function parseCliArgs(args: string[]): {
  command: 'start' | 'stop' | 'llmspy';
  llmspyStop: boolean;
  showHelp: boolean;
  showConfig: boolean;
  modelName: string | undefined;
  customSettings: Record<string, string>;
  stopPort: number;
  foregroundMode: boolean;
};
export function applyConfigDefaults<T extends { models?: Record<string, any>; server?: Record<string, any> }>(
  config: T,
  modelName: string,
): T & { models: Record<string, any>; server: { port: number; host: string } };
export function serverEnv(
  config: { models: Record<string, any>; server: Record<string, any> },
  modelName: string,
  settings?: Record<string, string | number | boolean | undefined>,
  configPath?: string,
): Record<string, string>;
export function readsAsOff(value: unknown): boolean;
export function readsAsOn(value: unknown): boolean;
export const LLMSPY_DEFAULT_URL: string;
export function llmspyAddress(value: unknown): string | null;
export interface LlmspyRoute {
  name: string;
  upstream: string;
  entry: string;
  baseUrl: string | null;
  endpointUrl: string;
}
export function llmspyRoute(options: {
  llmspy: string;
  modelName: string;
  llmName: string;
  endpoint: string;
  host: string;
  port: number | string;
}): LlmspyRoute;
export function llmspyLines(route: LlmspyRoute): string[];
export const LLMSPY_DEFAULT_MODELS: string[];
export function llmspyServers(models: string | undefined, basePort?: number | string): Array<{ model: string; port: number }>;
export function mergeUpstreams(existing: string | undefined, entries: string[]): string;
export function upstreamsFromEnvFile(text: string): string | undefined;
export function reachableUrl(host: string, port: number | string): string;
export function parseListeningPids(netstatOutput: string, port: number | string): string[];
