/* eslint-disable @typescript-eslint/naming-convention */
import { getStoredResponsesFile } from '../config/config-loader.js';
import { chaosKinds, type ChaosSettings } from './chaos.js';
import { getDelayConfig } from './delay.js';
import { logEntriesLimit, maxLogEntries } from './logger.js';
import { loadStoredResponses } from './stored-responses.js';

/**
 * The chaos, response delay and reply settings, changed while the server runs
 * through the admin API (see admin-api.ts). The server reads them from the
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

/**
 * The settings of the active preset that say what a reply is and what is
 * checked and logged. What a preset is otherwise (its template, model name
 * and endpoint) is fixed when the server starts.
 */
export interface ReplySettings {
	responseType: 'lorem' | 'stored';
	maxLoremParas: number;
	stream: boolean;
	validateRequests: boolean;
	logRequests: boolean;
	maxLoggedRequests: number;
}

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

// The most sentences a lorem reply can be asked to run to
const maxLoremSentences = 1000;

const isBoolean = (value: unknown): boolean => typeof value === 'boolean';
const onOrOff = (value: unknown): string => (value === true ? 'ON' : 'OFF');

// Where each reply setting is kept, what it has to be, and how it is written
// there when that is not simply as text
const replyChecks: Record<
	keyof ReplySettings,
	{
		variable: string;
		valid: (value: unknown) => boolean;
		expected: string;
		write?: (value: unknown) => string;
	}
> = {
	responseType: {
		variable: 'MOCK_LLM_RESPONSE_TYPE',
		valid: (value) => value === 'lorem' || value === 'stored',
		expected: '"lorem" or "stored"',
	},
	maxLoremParas: {
		variable: 'MAX_LOREM_PARAS',
		valid: (value) => isInteger(value, 1, maxLoremSentences),
		expected: `an integer from 1 to ${maxLoremSentences}`,
	},
	stream: {
		variable: 'STREAM',
		valid: isBoolean,
		expected: 'true or false',
	},
	validateRequests: {
		variable: 'VALIDATE_REQUESTS',
		valid: isBoolean,
		expected: 'true or false',
		write: onOrOff,
	},
	logRequests: {
		variable: 'LOG_REQUESTS',
		valid: isBoolean,
		expected: 'true or false',
		write: onOrOff,
	},
	maxLoggedRequests: {
		variable: 'MAX_LOGGED_REQUESTS',
		valid: (value) => isInteger(value, 1, logEntriesLimit),
		expected: `an integer from 1 to ${logEntriesLimit}`,
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

// The reply settings in use, read the way a request reads them
export const getReplySettings = (): ReplySettings => ({
	responseType:
		process.env.MOCK_LLM_RESPONSE_TYPE === 'stored' ? 'stored' : 'lorem',
	maxLoremParas: Number.parseInt(process.env.MAX_LOREM_PARAS ?? '', 10) || 5,
	stream: process.env.STREAM?.toLowerCase() === 'true',
	validateRequests: process.env.VALIDATE_REQUESTS === 'ON',
	logRequests: process.env.LOG_REQUESTS?.toUpperCase() === 'ON',
	maxLoggedRequests: maxLogEntries(),
});

/**
 * Changes the reply settings named in `change` and leaves the others as they
 * are. Throws a TypeError, and changes nothing, if a value can't be used.
 */
export const changeReplySettings = (change: unknown): void => {
	const settings = changedSettings(
		change,
		'settings',
		Object.keys(replyChecks),
	) as Array<[keyof ReplySettings, unknown]>;

	for (const [key, value] of settings) {
		if (!replyChecks[key].valid(value)) {
			throw new TypeError(
				`settings.${key} must be ${replyChecks[key].expected}`,
			);
		}
	}

	// As when the server starts: a stored responses file that can't be used
	// is refused here, rather than failing every reply from now on
	if (
		settings.some(
			([key, value]) => key === 'responseType' && value === 'stored',
		)
	) {
		try {
			const { file, baseDir } = getStoredResponsesFile();
			if (file) loadStoredResponses(file, baseDir);
		} catch (error) {
			throw new TypeError(
				`settings.responseType can not be "stored": ${(error as Error).message}`,
			);
		}
	}

	for (const [key, value] of settings) {
		const { variable, write = String } = replyChecks[key];
		process.env[variable] = write(value);
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
			...Object.values(replyChecks).map(({ variable }) => variable),
		].map((variable) => [variable, process.env[variable]]),
	);
};

export const restoreStartupSettings = (): void => {
	for (const [variable, value] of Object.entries(startup)) {
		if (value === undefined) delete process.env[variable];
		else process.env[variable] = value;
	}
};
