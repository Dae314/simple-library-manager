import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateConfigInput } from '$lib/server/validation.js';
import { isEndDateValid } from '$lib/utils/validation.js';

/**
 * Property 19: Convention configuration validation
 *
 * For any configuration submission where the end date is earlier than the
 * start date, or the weight tolerance is not a positive number, the system
 * SHALL reject the submission with a validation error.
 *
 * **Validates: Requirements 14.6, 14.7**
 */
describe('Property 19: Convention configuration validation', () => {
	// --- Date generators ---
	// Generate ISO date strings (YYYY-MM-DD) using integer offsets from a base date
	const dayOffset = fc.integer({ min: 0, max: 3650 }); // ~10 years of days
	const baseDate = new Date('2020-01-01').getTime();

	function offsetToDateStr(offset: number): string {
		const d = new Date(baseDate + offset * 86_400_000);
		return d.toISOString().split('T')[0];
	}

	const dateArb = dayOffset.map(offsetToDateStr);

	// Generate a pair where end < start (invalid): ensure gap of at least 1 day
	const invalidDatePair = fc
		.tuple(
			fc.integer({ min: 1, max: 3650 }),
			fc.integer({ min: 1, max: 3650 })
		)
		.filter(([a, b]) => a > b)
		.map(([startOff, endOff]) => ({
			startDate: offsetToDateStr(startOff),
			endDate: offsetToDateStr(endOff)
		}));

	// Generate a pair where end >= start (valid)
	const validDatePair = fc
		.tuple(
			fc.integer({ min: 0, max: 3650 }),
			fc.nat({ max: 365 })
		)
		.map(([startOff, gap]) => ({
			startDate: offsetToDateStr(startOff),
			endDate: offsetToDateStr(startOff + gap)
		}));

	// --- Weight tolerance generators ---
	const positiveTolerance = fc.double({ min: 0.001, max: 10_000, noNaN: true, noDefaultInfinity: true });

	const invalidTolerance = fc.oneof(
		fc.constant(0),
		fc.double({ min: -10_000, max: -0.001, noNaN: true, noDefaultInfinity: true }),
		fc.constant(NaN),
		fc.constant(Infinity),
		fc.constant(-Infinity)
	);

	const validWeightUnit = fc.constantFrom('oz', 'kg', 'g');

	it('rejects config where end date is before start date', () => {
		fc.assert(
			fc.property(invalidDatePair, positiveTolerance, validWeightUnit, (dates, tolerance, unit) => {
				const result = validateConfigInput({
					...dates,
					weightTolerance: tolerance,
					weightUnit: unit
				});
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('endDate');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects config with non-positive weight tolerance', () => {
		fc.assert(
			fc.property(invalidTolerance, validWeightUnit, (tolerance, unit) => {
				const result = validateConfigInput({
					weightTolerance: tolerance,
					weightUnit: unit
				});
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('weightTolerance');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('accepts config with valid dates (end >= start) and positive tolerance', () => {
		fc.assert(
			fc.property(validDatePair, positiveTolerance, validWeightUnit, (dates, tolerance, unit) => {
				const result = validateConfigInput({
					...dates,
					weightTolerance: tolerance,
					weightUnit: unit
				});
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('accepts config with only start date (no end date)', () => {
		fc.assert(
			fc.property(dateArb, positiveTolerance, (startDate, tolerance) => {
				const result = validateConfigInput({ startDate, weightTolerance: tolerance });
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
			}),
			{ numRuns: 100 }
		);
	});

	it('accepts config with only end date (no start date)', () => {
		fc.assert(
			fc.property(dateArb, positiveTolerance, (endDate, tolerance) => {
				const result = validateConfigInput({ endDate, weightTolerance: tolerance });
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects config with invalid weight unit', () => {
		const invalidUnit = fc.string({ minLength: 1 }).filter((s) => !['oz', 'kg', 'g'].includes(s));

		fc.assert(
			fc.property(invalidUnit, (unit) => {
				const result = validateConfigInput({ weightUnit: unit });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('weightUnit');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('accepts config with no fields (empty update is valid)', () => {
		const result = validateConfigInput({});
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual({});
	});
});

/**
 * Property 19b: Client-side date range validation (isEndDateValid)
 *
 * The client-side helper `isEndDateValid` SHALL return false for any date pair
 * where the end date is earlier than the start date, and true otherwise.
 * This enables live feedback on the config page without a form submission.
 *
 * **Validates: Requirements 14.6 (client-side)**
 */
describe('Property 19b: Client-side date range validation (isEndDateValid)', () => {
	const baseDate = new Date('2020-01-01').getTime();

	function offsetToDateStr(offset: number): string {
		const d = new Date(baseDate + offset * 86_400_000);
		return d.toISOString().split('T')[0];
	}

	// Inverted pair: start > end (at least 1 day gap)
	const invertedDatePair = fc
		.tuple(
			fc.integer({ min: 1, max: 3650 }),
			fc.integer({ min: 1, max: 3650 })
		)
		.filter(([a, b]) => a > b)
		.map(([startOff, endOff]) => ({
			startDate: offsetToDateStr(startOff),
			endDate: offsetToDateStr(endOff)
		}));

	// Valid pair: end >= start
	const validDatePair = fc
		.tuple(
			fc.integer({ min: 0, max: 3650 }),
			fc.nat({ max: 365 })
		)
		.map(([startOff, gap]) => ({
			startDate: offsetToDateStr(startOff),
			endDate: offsetToDateStr(startOff + gap)
		}));

	it('returns false for inverted date ranges (end before start)', () => {
		fc.assert(
			fc.property(invertedDatePair, ({ startDate, endDate }) => {
				expect(isEndDateValid(startDate, endDate)).toBe(false);
			}),
			{ numRuns: 200 }
		);
	});

	it('returns true for valid date ranges (end on or after start)', () => {
		fc.assert(
			fc.property(validDatePair, ({ startDate, endDate }) => {
				expect(isEndDateValid(startDate, endDate)).toBe(true);
			}),
			{ numRuns: 200 }
		);
	});

	it('returns true when either date is missing', () => {
		const dateArb = fc.integer({ min: 0, max: 3650 }).map(offsetToDateStr);

		fc.assert(
			fc.property(dateArb, (date) => {
				expect(isEndDateValid(date, null)).toBe(true);
				expect(isEndDateValid(date, undefined)).toBe(true);
				expect(isEndDateValid(date, '')).toBe(true);
				expect(isEndDateValid(null, date)).toBe(true);
				expect(isEndDateValid(undefined, date)).toBe(true);
				expect(isEndDateValid('', date)).toBe(true);
			}),
			{ numRuns: 100 }
		);
	});

	it('client and server agree on rejection for inverted ranges', () => {
		fc.assert(
			fc.property(invertedDatePair, ({ startDate, endDate }) => {
				const clientResult = isEndDateValid(startDate, endDate);
				const serverResult = validateConfigInput({
					startDate,
					endDate,
					weightTolerance: 1
				});

				// Both must reject
				expect(clientResult).toBe(false);
				expect(serverResult.valid).toBe(false);
				expect(serverResult.errors.endDate).toBe('End date must be on or after the start date');
			}),
			{ numRuns: 200 }
		);
	});

	it('client and server agree on acceptance for valid ranges', () => {
		fc.assert(
			fc.property(validDatePair, ({ startDate, endDate }) => {
				const clientResult = isEndDateValid(startDate, endDate);
				const serverResult = validateConfigInput({
					startDate,
					endDate,
					weightTolerance: 1
				});

				// Both must accept
				expect(clientResult).toBe(true);
				expect(serverResult.valid).toBe(true);
				expect(serverResult.errors).not.toHaveProperty('endDate');
			}),
			{ numRuns: 200 }
		);
	});
});