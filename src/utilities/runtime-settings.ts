/* eslint-disable @typescript-eslint/naming-convention */
import { chaosKinds, type ChaosSettings } from './chaos.js';
import { getDelayConfig } from './delay.js';

/**
 * The chaos and response delay settings, changed while the server runs
 * through the admin API (see admin-api.ts). The server reads both from the
 * environment on every request, so a change is written there and takes effect
 * on the next request. The config file is never written.
 */
export interface DelaySettings {
	min: number;
	max: number;
}

const chaosVariables: Record<keyof ChaosSettings, string> = {
	enabled: 'CHAOS_ENABLED',
	frequency: 'CHAOS_FREQUENCY',
	mode: 'CHAOS_MODE',
	status: 'CHAOS_STATUS',
	kind: 'CHAOS_KIND',
	afterChunks: 'CHAOS_AFTER_CHUNKS',
};

const delayVariables: Record<keyof DelaySettings, string> = {
	min: 'RESPONSE_DELAY_MIN',
	max: 'RESPONSE_DELAY_MAX',
};

// The longest wait a timer can hold (about 24.8 days); a longer one would
// fire at once
const maxDelayMs = 2_147_483_647;

const isInteger = (value: unknown, min: number, max = Infinity): boolean =>
	Number.isInteger(value) && Number(value) >= min && Number(value) <= max;

// What each chaos setting has to be, and how to say so when it is not
const chaosChecks: Record<
	keyof ChaosSettings,
	{ valid: (value: unknown) => boolean; expected: string }
> = {
	enabled: {
		valid: (value) => typeof value === 'boolean',
		expected: 'true or false',
	},
	frequency: {
		valid: (value) => isInteger(value, 1),
		expected: 'an integer of 1 or more',
	},
	mode: {
		valid: (value) => value === 'every' || value === 'random',
		expected: '"every" or "random"',
	},
	status: {
		valid: (value) => isInteger(value, 400, 599),
		expected: 'an integer from 400 to 599',
	},
	kind: {
		valid: (value) => chaosKinds.includes(value as never),
		expected: `one of: ${chaosKinds.join(', ')}`,
	},
	afterChunks: {
		valid: (value) => isInteger(value, 0),
		expected: 'an integer of 0 or more',
	},
};

// The settings of a change, once it is known to be an object with no setting
// other than the `allowed` ones
const changedSettings = (
	change: unknown,
	label: string,
	allowed: string[],
): Array<[string, unknown]> => {
	if (
		typeof change !== 'object' ||
		change === null ||
		Array.isArray(change)
	) {
		throw new TypeError(`${label} must be a JSON object`);
	}

	const unknown = Object.keys(change).filter((key) => !allowed.includes(key));
	if (unknown.length > 0) {
		throw new TypeError(
			`${label} has unknown settings: ${unknown.join(', ')}`,
		);
	}

	return Object.entries(change);
};

/**
 * Changes the chaos settings named in `change` and leaves the others as they
 * are. Unlike the CLI flags, nothing falls back to a default: a value that
 * can't be used throws a TypeError and nothing is changed.
 */
export const changeChaos = (change: unknown): void => {
	const settings = changedSettings(
		change,
		'chaos',
		Object.keys(chaosVariables),
	) as Array<[keyof ChaosSettings, unknown]>;

	for (const [key, value] of settings) {
		if (!chaosChecks[key].valid(value)) {
			throw new TypeError(
				`chaos.${key} must be ${chaosChecks[key].expected}`,
			);
		}
	}

	for (const [key, value] of settings) {
		process.env[chaosVariables[key]] = String(value);
	}
};

// The response delay in use, in milliseconds
export const getDelay = (): DelaySettings => {
	const { min, max } = getDelayConfig();

	return { min, max };
};

/**
 * Changes the response delay settings named in `change` and leaves the other
 * as it is. Throws a TypeError, and changes nothing, if the result can't be
 * used.
 */
export const changeDelay = (change: unknown): void => {
	const settings = changedSettings(
		change,
		'delay',
		Object.keys(delayVariables),
	) as Array<[keyof DelaySettings, unknown]>;

	for (const [key, value] of settings) {
		if (!isInteger(value, 0, maxDelayMs)) {
			throw new TypeError(
				`delay.${key} must be an integer from 0 to ${maxDelayMs} (milliseconds)`,
			);
		}
	}

	const delay = { ...getDelay(), ...Object.fromEntries(settings) };
	if (delay.min > delay.max) {
		throw new TypeError(
			`delay.min (${delay.min}) can not be more than delay.max (${delay.max}): set both`,
		);
	}

	for (const [key, value] of settings) {
		process.env[delayVariables[key]] = String(value);
	}
};

// The settings as they were when the server started, to go back to
let startup: Record<string, string | undefined> = {};

// Call once the config has been read into the environment
export const rememberStartupSettings = (): void => {
	startup = Object.fromEntries(
		[
			...Object.values(chaosVariables),
			...Object.values(delayVariables),
		].map((variable) => [variable, process.env[variable]]),
	);
};

export const restoreStartupSettings = (): void => {
	for (const [variable, value] of Object.entries(startup)) {
		if (value === undefined) delete process.env[variable];
		else process.env[variable] = value;
	}
};
