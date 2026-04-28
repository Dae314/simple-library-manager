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
