import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { delay, getDelayConfig } from '../utilities/delay.js';

describe('delay utility', () => {
	describe('delay function', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should not delay when both min and max are 0', async () => {
			const promise = delay(0, 0);
			await vi.runAllTimersAsync();
			await expect(promise).resolves.toBeUndefined();
		});

		it('should not delay when both min and max are negative', async () => {
			const promise = delay(-100, -50);
			await vi.runAllTimersAsync();
			await expect(promise).resolves.toBeUndefined();
		});

		it('should delay for exact time when min equals max', async () => {
			const delayTime = 1000;
			const promise = delay(delayTime, delayTime);

			// Fast-forward time
			vi.advanceTimersByTime(delayTime);

			await expect(promise).resolves.toBeUndefined();
		});

		it('should delay for a random time between min and max', async () => {
			const min = 500;
			const max = 1500;

			// Mock Math.random to return 0.5 (middle value)
			vi.spyOn(Math, 'random').mockReturnValue(0.5);

			const promise = delay(min, max);

			// The expected delay should be min + 0.5 * (max - min + 1)
			const expectedDelay = Math.floor(min + 0.5 * (max - min + 1));

			vi.advanceTimersByTime(expectedDelay);

			await expect(promise).resolves.toBeUndefined();
		});

		it('should handle swapped min/max values correctly', async () => {
			const promise = delay(1000, 500); // max < min

			// Should use 500 as min and 1000 as max
			vi.advanceTimersByTime(1000); // Use max time to ensure it completes

			await expect(promise).resolves.toBeUndefined();
		});
	});

	describe('getDelayConfig function', () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = { ...originalEnv };
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		it('should return default values when env vars are not set', () => {
			delete process.env.RESPONSE_DELAY_MIN;
			delete process.env.RESPONSE_DELAY_MAX;

			const config = getDelayConfig();
			expect(config).toEqual({
				min: 0,
				max: 0,
				enabled: false,
			});
		});

		it('should parse env vars correctly', () => {
			process.env.RESPONSE_DELAY_MIN = '500';
			process.env.RESPONSE_DELAY_MAX = '2000';

			const config = getDelayConfig();
			expect(config).toEqual({
				min: 500,
				max: 2000,
				enabled: true,
			});
		});

		it('should handle invalid env var values', () => {
			process.env.RESPONSE_DELAY_MIN = 'invalid';
			process.env.RESPONSE_DELAY_MAX = 'also-invalid';

			const config = getDelayConfig();
			expect(config).toEqual({
				min: 0,
				max: 0,
				enabled: false,
			});
		});

		it('should enable delay when only min is set', () => {
			process.env.RESPONSE_DELAY_MIN = '1000';
			delete process.env.RESPONSE_DELAY_MAX;

			const config = getDelayConfig();
			expect(config).toEqual({
				min: 1000,
				max: 0,
				enabled: true,
			});
		});

		it('should enable delay when only max is set', () => {
			delete process.env.RESPONSE_DELAY_MIN;
			process.env.RESPONSE_DELAY_MAX = '1000';

			const config = getDelayConfig();
			expect(config).toEqual({
				min: 0,
				max: 1000,
				enabled: true,
			});
		});
	});
});
