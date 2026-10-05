import { existsSync } from 'fs';
import { describe, expect, test } from 'vitest';
import {
	applyConfigDefaults,
	parseCliArgs,
	parseListeningPids,
	resolveModelName,
	tsxCliPath,
} from '../../../bin/process-utils.js';

describe('tsxCliPath', () => {
	test('points at an existing tsx cli script', () => {
		const path = tsxCliPath();

		expect(path).toMatch(/tsx[\\/]dist[\\/]cli\.mjs$/);
		expect(existsSync(path)).toBe(true);
	});
});

describe('resolveModelName', () => {
	test('the --model flag wins over the config default', () => {
		expect(resolveModelName('gemini', { defaultModel: 'claude' })).toBe(
			'gemini',
		);
	});

	test('uses the config defaultModel when no flag is given', () => {
		expect(resolveModelName(undefined, { defaultModel: 'claude' })).toBe(
			'claude',
		);
	});

	test('falls back to chatgpt when neither is set', () => {
		expect(resolveModelName(undefined, {})).toBe('chatgpt');
	});
});

describe('parseCliArgs', () => {
	test('defaults to start with no arguments', () => {
		expect(parseCliArgs([])).toMatchObject({
			command: 'start',
			modelName: undefined,
			customSettings: {},
			foregroundMode: false,
		});
	});

	test('reads options after the start command', () => {
		const parsed = parseCliArgs([
			'start',
			'--model=claude',
			'--port',
			'3000',
		]);

		expect(parsed.command).toBe('start');
		expect(parsed.modelName).toBe('claude');
		expect(parsed.customSettings).toEqual({ port: '3000' });
	});

	test('keeps the first option when the command is omitted', () => {
		expect(parseCliArgs(['--model=claude']).modelName).toBe('claude');
		expect(parseCliArgs(['--model', 'gemini']).modelName).toBe('gemini');
		expect(parseCliArgs(['--foreground', '--stream=true'])).toMatchObject({
			command: 'start',
			foregroundMode: true,
			customSettings: { stream: 'true' },
		});
	});

	test('reads the chaos options', () => {
		expect(
			parseCliArgs([
				'--chaos=true',
				'--chaosFrequency',
				'3',
				'--chaosMode=random',
				'--chaosStatus=429',
			]).customSettings,
		).toEqual({
			chaos: 'true',
			chaosFrequency: '3',
			chaosMode: 'random',
			chaosStatus: '429',
		});
	});

	test('stop takes its port from --port', () => {
		expect(parseCliArgs(['stop'])).toMatchObject({
			command: 'stop',
			stopPort: 8001,
		});
		expect(parseCliArgs(['stop', '--port=3000']).stopPort).toBe(3000);
		expect(parseCliArgs(['stop', '--port', '3000']).stopPort).toBe(3000);
	});

	test('config accepts --model', () => {
		expect(parseCliArgs(['config', '--model=claude'])).toMatchObject({
			showConfig: true,
			modelName: 'claude',
		});
	});

	test('help ignores other arguments', () => {
		for (const flag of ['help', '--help', '-h']) {
			expect(parseCliArgs([flag, '--model=claude'])).toMatchObject({
				showHelp: true,
				modelName: undefined,
			});
		}
	});
});

describe('applyConfigDefaults', () => {
	test('fills in the optional settings of a short preset', () => {
		const config = applyConfigDefaults(
			{
				models: {
					claude: {
						name: 'claude',
						endpoint: 'v1/messages',
						stream: true,
						responseDelay: { min: 300 },
					},
				},
			},
			'claude',
		);

		expect(config.models.claude).toEqual({
			name: 'claude',
			model: 'mock-model',
			endpoint: 'v1/messages',
			responseType: 'lorem',
			maxLoremParas: 8,
			validateRequests: false,
			logRequests: false,
			maxLoggedRequests: 10,
			debug: false,
			stream: true,
			responseDelay: { min: 300, max: 0 },
			embeddings: { enabled: false, dimensions: 128 },
			chaos: { enabled: false, frequency: 1, mode: 'every', status: 500 },
		});
		expect(config.server).toEqual({ port: 8001, host: '0.0.0.0' });
	});

	const withChaos = (chaos: Record<string, unknown>) =>
		applyConfigDefaults(
			{ models: { a: { name: 'openai', endpoint: 'chat', chaos } } },
			'a',
		);

	test('fills in the chaos settings that are left out', () => {
		expect(
			withChaos({ enabled: true, frequency: 3 }).models.a.chaos,
		).toEqual({ enabled: true, frequency: 3, mode: 'every', status: 500 });
	});

	test.each([
		[{ frequency: 0 }, 'chaos.frequency'],
		[{ frequency: 2.5 }, 'chaos.frequency'],
		[{ frequency: '3' }, 'chaos.frequency'],
		[{ mode: 'sometimes' }, 'chaos.mode'],
		[{ status: 200 }, 'chaos.status'],
		[{ status: 600 }, 'chaos.status'],
	])('rejects a chaos setting of %o', (chaos, setting) => {
		expect(() => withChaos(chaos)).toThrow(setting);
	});

	test('keeps values that are set', () => {
		const config = applyConfigDefaults(
			{
				models: {
					chatgpt: {
						name: 'openai',
						endpoint: 'chat',
						validateRequests: true,
						embeddings: { enabled: true, dimensions: 64 },
					},
				},
				server: { port: 3000 },
			},
			'chatgpt',
		);

		expect(config.models.chatgpt.validateRequests).toBe(true);
		expect(config.models.chatgpt.embeddings).toEqual({
			enabled: true,
			dimensions: 64,
		});
		expect(config.server).toEqual({ port: 3000, host: '0.0.0.0' });
	});

	test('rejects a preset without a name or endpoint', () => {
		expect(() =>
			applyConfigDefaults({ models: { a: { name: 'openai' } } }, 'a'),
		).toThrow('"endpoint"');
		expect(() =>
			applyConfigDefaults({ models: { a: { endpoint: 'chat' } } }, 'a'),
		).toThrow('"name"');
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
