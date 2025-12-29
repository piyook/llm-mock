export async function delay(minMs: number, maxMs: number): Promise<void> {
	// If both min and max are 0 or negative, no delay
	if (minMs <= 0 && maxMs <= 0) {
		return;
	}

	// Ensure min is not greater than max
	const actualMin = Math.max(0, Math.min(minMs, maxMs));
	const actualMax = Math.max(0, Math.max(minMs, maxMs));

	// If both are the same, use that value
	const delayMs =
		actualMin === actualMax
			? actualMin
			: Math.floor(Math.random() * (actualMax - actualMin + 1)) +
				actualMin;

	// Only delay if we have a positive value
	if (delayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
}

export function getDelayConfig(): {
	min: number;
	max: number;
	enabled: boolean;
} {
	const min = parseInt(process.env.RESPONSE_DELAY_MIN || '0', 10);
	const max = parseInt(process.env.RESPONSE_DELAY_MAX || '0', 10);
	const enabled = min > 0 || max > 0;

	return {
		min: isNaN(min) ? 0 : min,
		max: isNaN(max) ? 0 : max,
		enabled,
	};
}
