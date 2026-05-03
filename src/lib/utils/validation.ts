// Client-side validation helpers for form inputs.
// These mirror server-side checks for immediate UI feedback.

/**
 * Check if a string value is non-empty after trimming.
 */
export function isNonEmpty(value: string | null | undefined): boolean {
	return value != null && value.trim().length > 0;
}

/**
 * Check if a value is a positive integer.
 */
export function isPositiveInteger(value: unknown): boolean {
	const n = Number(value);
	return Number.isInteger(n) && n > 0;
}

/**
 * Check if a value is a positive finite number.
 */
export function isPositiveNumber(value: unknown): boolean {
	const n = Number(value);
	return typeof n === 'number' && isFinite(n) && n > 0;
}

/**
 * Validate that endDate is on or after startDate.
 * Returns true if dates are valid, or if either date is missing.
 */
export function isEndDateValid(startDate: string | null | undefined, endDate: string | null | undefined): boolean {
	if (!startDate || !endDate) return true;
	return new Date(endDate) >= new Date(startDate);
}

/**
 * Parse a form field value to a number, returning null if invalid.
 */
export function parseNumber(value: string | null | undefined): number | null {
	if (value == null || value.trim() === '') return null;
	const n = Number(value);
	return isFinite(n) ? n : null;
}

// --- Weight Warning ---

export type WeightWarningLevel = 'red' | 'yellow' | 'none';

/**
 * Determines the weight warning level for a checkin.
 *
 * - 'red': weight difference exceeds the configured warning threshold (tolerance)
 * - 'yellow': weight is outside 2% of checkout weight but within the threshold,
 *             OR checkin weight is more than 2% heavier than checkout weight
 * - 'none': weight is within 2% of checkout weight
 */
export function getWeightWarningLevel(
	checkoutWeight: number,
	checkinWeight: number,
	tolerance: number
): WeightWarningLevel {
	const difference = Math.abs(checkinWeight - checkoutWeight);
	const twoPercentThreshold = checkoutWeight * 0.02;

	// Red: exceeds the configured warning threshold
	if (difference > tolerance) {
		return 'red';
	}

	// Within 2% of checkout weight — no warning
	if (difference <= twoPercentThreshold) {
		return 'none';
	}

	// Between 2% and tolerance (lighter or heavier) — yellow
	return 'yellow';
}

/** @deprecated Use getWeightWarningLevel instead */
export function shouldWarnWeight(checkoutWeight: number, checkinWeight: number, tolerance: number): boolean {
	return getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance) !== 'none';
}
