import { createRequire } from 'module';
import { dirname, resolve } from 'path';

/**
 * Path to tsx's CLI script, so the server can be started with
 * `node <cli> server.ts` instead of going through npx, a shell or `start`.
 */
export function tsxCliPath() {
  const require = createRequire(import.meta.url);
  return resolve(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
}

/**
 * Model preset to run: the --model flag if given, else the config's
 * `defaultModel`, else chatgpt.
 */
export function resolveModelName(flagValue, config) {
  return flagValue || config?.defaultModel || 'chatgpt';
}

/** The port `llmock stop` stops when it is given no --port */
export const DEFAULT_STOP_PORT = 8001;

const COMMAND_ARGS = new Set([
  'start', 'stop', 'help', '--help', '-h', 'config', '--config', '-c',
]);

/**
 * Parses the CLI arguments. The command is optional: `llmock --model=claude`
 * is the same as `llmock start --model=claude`. Options accept both
 * `--key=value` and `--key value`.
 */
export function parseCliArgs(args) {
  const parsed = {
    command: 'start',
    showHelp: false,
    showConfig: false,
    modelName: undefined, // from --model; otherwise the config's defaultModel
    customSettings: {},
    stopPort: DEFAULT_STOP_PORT,
    foregroundMode: false,
  };

  const firstArg = args[0];
  if (firstArg === 'help' || firstArg === '--help' || firstArg === '-h') {
    parsed.showHelp = true;
    return parsed;
  }

  if (firstArg === 'config' || firstArg === '--config' || firstArg === '-c') {
    parsed.showConfig = true;
  } else if (firstArg === 'stop') {
    parsed.command = 'stop';
  }

  // Only drop the first argument when it is a command, not an option
  const options = COMMAND_ARGS.has(firstArg) ? args.slice(1) : args;

  for (let i = 0; i < options.length; i++) {
    const arg = options[i];
    if (!arg.startsWith('--')) continue;

    if (arg === '--foreground') {
      parsed.foregroundMode = true;
      continue;
    }

    // --llmspy alone turns it on; `--llmspy <url>` names LLMSpy's address
    if (arg === '--llmspy') {
      const next = options[i + 1];
      parsed.customSettings.llmspy = next !== undefined && !next.startsWith('--') ? options[++i] : 'true';
      continue;
    }

    let key;
    let value;
    const equalIndex = arg.indexOf('=');
    if (equalIndex > 0) {
      key = arg.substring(2, equalIndex);
      value = arg.substring(equalIndex + 1);
    } else if (i + 1 < options.length) {
      key = arg.substring(2);
      value = options[i + 1];
      i++; // Skip next argument
    } else {
      continue;
    }

    if (key === 'model') {
      parsed.modelName = value;
    } else if (key === 'port' && parsed.command === 'stop') {
      parsed.stopPort = parseInt(value, 10);
    } else {
      parsed.customSettings[key] = value;
    }
  }

  return parsed;
}

// What a failing call gets; the server's own list is in src/utilities/chaos.ts
const CHAOS_KINDS = ['http', 'stream-error', 'stream-drop', 'stream-stall'];

/**
 * Fills in the optional settings of a model preset and the server block, so
 * a short preset in .llmockrc.json works. `name` and `endpoint` are required.
 * Throws an Error describing the problem if the preset can't be used.
 */
export function applyConfigDefaults(config, modelName) {
  const preset = config.models?.[modelName] ?? {};

  for (const key of ['name', 'endpoint']) {
    if (typeof preset[key] !== 'string' || preset[key] === '') {
      throw new Error(`Model "${modelName}" must set "${key}" in the configuration`);
    }
  }

  const model = {
    model: 'mock-model',
    responseType: 'lorem',
    maxLoremParas: 8,
    validateRequests: false,
    logRequests: false,
    maxLoggedRequests: 10,
    debug: false,
    stream: false,
    ...preset,
    responseDelay: { min: 0, max: 0, ...preset.responseDelay },
    embeddings: { enabled: false, dimensions: 128, ...preset.embeddings },
    chaos: {
      enabled: false,
      frequency: 1,
      mode: 'every',
      status: 500,
      kind: 'http',
      afterChunks: 2,
      ...preset.chaos,
    },
  };

  const { frequency, mode, status, kind, afterChunks } = model.chaos;
  if (!Number.isInteger(frequency) || frequency < 1) {
    throw new Error(`Model "${modelName}": chaos.frequency must be a whole number of 1 or more`);
  }
  if (mode !== 'every' && mode !== 'random') {
    throw new Error(`Model "${modelName}": chaos.mode must be "every" or "random"`);
  }
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error(`Model "${modelName}": chaos.status must be an HTTP error status (400 to 599)`);
  }
  if (!CHAOS_KINDS.includes(kind)) {
    throw new Error(`Model "${modelName}": chaos.kind must be one of: ${CHAOS_KINDS.join(', ')}`);
  }
  if (!Number.isInteger(afterChunks) || afterChunks < 0) {
    throw new Error(`Model "${modelName}": chaos.afterChunks must be a whole number of 0 or more`);
  }

  return {
    ...config,
    models: { ...config.models, [modelName]: model },
    server: { port: 8001, host: '0.0.0.0', ...config.server },
  };
}

/**
 * The environment variables the server reads its settings from, for preset
 * `modelName` of `config` (already filled in by applyConfigDefaults).
 * `settings` are the CLI options (`--port=3000` is `{ port: '3000' }`) and win
 * over the config. `configPath` is left out of the result when not given.
 * Throws an Error when the preset's endpoint clashes with a built-in route.
 */
export function serverEnv(config, modelName, settings = {}, configPath) {
  const modelConfig = config.models[modelName];
  const serverConfig = config.server;
  const custom = Object.fromEntries(
    Object.entries(settings)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const flag = (key, configValue, on, off) =>
    (custom[key] !== undefined ? readsAsOn(custom[key]) : configValue) ? on : off;

  const env = {
    // The selected model name and config path
    LLM_MODEL_NAME: modelName,
    ...(configPath ? { CONFIG_PATH: configPath } : {}),

    // Server settings
    SERVER_PORT: custom.port || serverConfig.port.toString(),
    SERVER_HOST: custom.host || serverConfig.host,
    ADMIN_API: readsAsOff(custom.admin !== undefined ? custom.admin : serverConfig.admin)
      ? 'false'
      : 'true',
    // The flag wins, then a UI_THEME already in the environment, then the config
    UI_THEME: custom.uiTheme || process.env.UI_THEME || serverConfig.uiTheme || 'dark',
    // LLMSpy's address, empty when the LLMSpy hint is off
    LLMSPY_URL: llmspyAddress(custom.llmspy !== undefined ? custom.llmspy : serverConfig.llmspy) ?? '',
    LLM_URL_ENDPOINT: custom.endpoint || modelConfig.endpoint,

    // LLM settings
    LLM_NAME: modelConfig.name,
    LLM_MODEL: modelConfig.model,
    MOCK_LLM_RESPONSE_TYPE: custom.responseType || modelConfig.responseType,
    MAX_LOREM_PARAS: custom.maxLoremParas || modelConfig.maxLoremParas.toString(),

    // Feature flags
    VALIDATE_REQUESTS: flag('validateRequests', modelConfig.validateRequests, 'ON', 'OFF'),
    LOG_REQUESTS: flag('logRequests', modelConfig.logRequests, 'ON', 'OFF'),
    MAX_LOGGED_REQUESTS: custom.maxLoggedRequests || modelConfig.maxLoggedRequests.toString(),
    DEBUG: flag('debug', modelConfig.debug, '*', 'OFF'),
    STREAM: flag('stream', modelConfig.stream, 'true', 'false'),

    // Response delays
    RESPONSE_DELAY_MIN: custom.delayMin || modelConfig.responseDelay.min.toString(),
    RESPONSE_DELAY_MAX: custom.delayMax || modelConfig.responseDelay.max.toString(),

    // Chaos
    CHAOS_ENABLED: flag('chaos', modelConfig.chaos.enabled, 'true', 'false'),
    CHAOS_FREQUENCY: custom.chaosFrequency || modelConfig.chaos.frequency.toString(),
    CHAOS_MODE: custom.chaosMode || modelConfig.chaos.mode,
    CHAOS_STATUS: custom.chaosStatus || modelConfig.chaos.status.toString(),
    CHAOS_KIND: custom.chaosKind || modelConfig.chaos.kind,
    CHAOS_AFTER_CHUNKS: custom.chaosAfterChunks || modelConfig.chaos.afterChunks.toString(),

    // Embeddings
    ENABLE_EMBEDDINGS_MOCK: flag('embeddings', modelConfig.embeddings.enabled, 'true', 'false'),
    EMBEDDING_DIMENSION: custom.embeddingDimensions || modelConfig.embeddings.dimensions.toString(),
  };

  // The embeddings mock owns /v1/embeddings, so the chat endpoint can't use it too
  const endpoint = env.LLM_URL_ENDPOINT.replace(/^\/+/, '');
  if (endpoint === 'v1/embeddings' && env.ENABLE_EMBEDDINGS_MOCK === 'true') {
    throw new Error(
      `Model "${modelName}" uses the endpoint "v1/embeddings", which the embeddings mock already serves. Use a different endpoint or set embeddings.enabled to false.`
    );
  }

  // The admin API owns everything under /admin
  if (env.ADMIN_API === 'true' && (endpoint === 'admin' || endpoint.startsWith('admin/'))) {
    throw new Error(
      `Model "${modelName}" uses the endpoint "${endpoint}", but paths under "admin" belong to the admin API. Use a different endpoint or set server.admin to false.`
    );
  }

  return env;
}

/**
 * Base URL a client on this machine reaches a server listening on `host` and
 * `port` at: a wildcard address (0.0.0.0 or ::) is reached on 127.0.0.1, and
 * an IPv6 address is put in brackets.
 */
export function reachableUrl(host, port) {
  const reachable = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${reachable.includes(':') ? `[${reachable}]` : reachable}:${port}`;
}

/** Where LLMSpy listens unless --llmspy or server.llmspy names another address */
export const LLMSPY_DEFAULT_URL = 'http://127.0.0.1:8080';

/**
 * LLMSpy's address from the llmspy setting, or null when it is off (not set,
 * or false, 0, off or no). An on value (true, 1, on, yes) means LLMSpy's
 * default address; anything else must be an http(s) URL, of which only the
 * origin is kept. Throws an Error for a value that is neither.
 */
export function llmspyAddress(value) {
  if (value === undefined || value === null || value === false) return null;
  const text = String(value).trim();
  if (text === '' || readsAsOff(text)) return null;
  if (readsAsOn(text)) return LLMSPY_DEFAULT_URL;

  let url;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(
      `llmspy must be true, false or LLMSpy's address (such as ${LLMSPY_DEFAULT_URL}), not "${text}"`
    );
  }
  return url.origin;
}

// The part of each format's endpoint that its SDKs add to the base URL
const SDK_PATHS = { claude: 'v1/messages', openai: 'chat/completions' };

/**
 * How to put this server behind LLMSpy at `llmspy` (an address from
 * llmspyAddress): the LLMSPY_UPSTREAMS entry that makes it an upstream, the
 * base URL an SDK client is given, and the full URL of the endpoint through
 * LLMSpy. `baseUrl` is null for a format with no known SDK path (gemini,
 * custom templates): those clients call `endpointUrl`.
 */
export function llmspyRoute({ llmspy, modelName, llmName, endpoint, host, port }) {
  // LLMSpy names are lowercase letters, digits and dashes. A port other than
  // the default is part of the name, so two servers of one preset get two
  // upstreams (LLMSpy keeps only the last of two entries with one name).
  const slug = String(modelName).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const portPart = Number(port) === DEFAULT_STOP_PORT ? '' : `-${port}`;
  const name = `${slug ? `llmock-${slug}` : 'llmock'}${portPart}`;
  const upstream = reachableUrl(host, port);
  const path = String(endpoint).replace(/^\/+/, '');
  const prefix = `${llmspy}/${name}`;

  const sdkPath = SDK_PATHS[llmName];
  let baseUrl = null;
  if (sdkPath && (path === sdkPath || path.endsWith(`/${sdkPath}`))) {
    const rest = path.slice(0, path.length - sdkPath.length).replace(/\/+$/, '');
    baseUrl = rest ? `${prefix}/${rest}` : prefix;
  }

  return {
    name,
    upstream,
    entry: `${name}=${upstream}`,
    baseUrl,
    endpointUrl: `${prefix}/${path}`,
  };
}

/** The lines that tell someone how to use a server through LLMSpy */
export function llmspyLines(route) {
  return [
    'To see its calls in LLMSpy, start LLMSpy with this upstream:',
    `  LLMSPY_UPSTREAMS=${route.entry}`,
    ...(route.baseUrl ? [`and give your app the base URL ${route.baseUrl}`] : []),
    `(the endpoint through LLMSpy is ${route.endpointUrl})`,
  ];
}

// Whether a setting reads as "off" (see readsAsOff in src/config/config-loader.ts)
export const readsAsOff = (value) =>
  ['false', '0', 'off', 'no'].includes(String(value).trim().toLowerCase());

/**
 * Whether a setting reads as "on": true, or "true", "1", "on" or "yes" in any
 * case. The on/off options (stream, debug, chaos, ...) are on only then.
 */
export const readsAsOn = (value) =>
  ['true', '1', 'on', 'yes'].includes(String(value).trim().toLowerCase());

/**
 * Pids LISTENING on `port`, from `netstat -ano` output. Client connections
 * to the port are ignored so stopping the server never kills a browser or
 * test runner that merely has a connection open. Listening rows are found by
 * their foreign address (`0.0.0.0:0` or `[::]:0`) rather than the state
 * name, which is localised on non-English Windows.
 */
export function parseListeningPids(netstatOutput, port) {
  const pids = new Set();

  for (const line of netstatOutput.split(/\r?\n/)) {
    const [proto, local, foreign, , pid] = line.trim().split(/\s+/);

    if (proto !== 'TCP' || !local?.endsWith(`:${port}`)) continue;
    if (!foreign?.endsWith(':0')) continue;
    if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }

  return [...pids];
}
