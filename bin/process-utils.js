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
    stopPort: 8001,
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
    debug: false,
    stream: false,
    ...preset,
    responseDelay: { min: 0, max: 0, ...preset.responseDelay },
    embeddings: { enabled: false, dimensions: 128, ...preset.embeddings },
  };

  return {
    ...config,
    models: { ...config.models, [modelName]: model },
    server: { port: 8001, host: '0.0.0.0', ...config.server },
  };
}

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
