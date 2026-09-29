import { existsSync } from 'fs';
import { describe, expect, test } from 'vitest';
import { parseListeningPids, tsxCliPath } from '../../../bin/process-utils.js';

describe('tsxCliPath', () => {
	test('points at an existing tsx cli script', () => {
		const path = tsxCliPath();

		expect(path).toMatch(/tsx[\\/]dist[\\/]cli\.mjs$/);
		expect(existsSync(path)).toBe(true);
	});
});

describe('parseListeningPids', () => {
	const netstat = [
		'Active Connections',
		'',
		'  Proto  Local Address          Foreign Address        State           PID',
		'  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1032',
		'  TCP    0.0.0.0:8001           0.0.0.0:0              LISTENING       4242',
		'  TCP    [::]:8001              [::]:0                 LISTENING       4242',
		'  TCP    0.0.0.0:80010          0.0.0.0:0              LISTENING       5555',
		'  TCP    127.0.0.1:8001         127.0.0.1:64287        ESTABLISHED     9001',
		'  TCP    127.0.0.1:64287        127.0.0.1:8001         ESTABLISHED     9002',
		'  TCP    [::1]:64282            [::1]:8001             SYN_SENT        9003',
		'  UDP    0.0.0.0:8001           *:*                                    7777',
	].join('\r\n');

	test('returns each process listening on the port once', () => {
		expect(parseListeningPids(netstat, 8001)).toEqual(['4242']);
	});

	test('ignores clients connected to the port', () => {
		const pids = parseListeningPids(netstat, 8001);

		expect(pids).not.toContain('9001');
		expect(pids).not.toContain('9002');
		expect(pids).not.toContain('9003');
	});

	test('does not match ports that merely start with the number', () => {
		expect(parseListeningPids(netstat, 8001)).not.toContain('5555');
		expect(parseListeningPids(netstat, 80010)).toEqual(['5555']);
	});

	test('does not depend on the state text being English', () => {
		const german =
			'  TCP    0.0.0.0:8001           0.0.0.0:0              ABHÖREN         4242';

		expect(parseListeningPids(german, 8001)).toEqual(['4242']);
	});

	test('accepts the port as a string', () => {
		expect(parseListeningPids(netstat, '8001')).toEqual(['4242']);
	});

	test('returns nothing for empty output or an unused port', () => {
		expect(parseListeningPids('', 8001)).toEqual([]);
		expect(parseListeningPids(netstat, 9999)).toEqual([]);
	});
});
