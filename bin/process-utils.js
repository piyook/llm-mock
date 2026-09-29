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
