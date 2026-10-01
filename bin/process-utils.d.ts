export function tsxCliPath(): string;
export function resolveModelName(flagValue: string | undefined, config: { defaultModel?: string }): string;
export function parseCliArgs(args: string[]): {
  command: 'start' | 'stop';
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
export function parseListeningPids(netstatOutput: string, port: number | string): string[];
