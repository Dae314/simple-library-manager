import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { shouldWarnWeight } from '$lib/server/validation.js';

/**
 * Property 7: Weight warning correctness
 *
 * For any checkout weight, checkin weight, and weight tolerance (all positive
 * numbers), the system SHALL produce a weight warning if and only if the
 * absolute difference between checkout weight and checkin weight exceeds the
 * weight tolerance.
 *
 * **Validates: Requirements 5.7**
 */
describe('Property 7: Weight warning correctness', () => {
	const positiveWeight = fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true });
	const positiveTolerance = fc.double({ min: 0.001, max: 1_000, noNaN: true, noDefaultInfinity: true });

	it('warns if and only if |checkinWeight - checkoutWeight| > tolerance', () => {
		fc.assert(
			fc.property(positiveWeight, positiveWeight, positiveTolerance, (checkoutWeight, checkinWeight, tolerance) => {
				const result = shouldWarnWeight(checkoutWeight, checkinWeight, tolerance);
				const diff = Math.abs(checkinWeight - checkoutWeight);
				const expected = diff > tolerance;
				expect(result).toBe(expected);
			}),
			{ numRuns: 1000 }
		);
	});

	it('never warns when checkout and checkin weights are identical', () => {
		fc.assert(
			fc.property(positiveWeight, positiveTolerance, (weight, tolerance) => {
				const result = shouldWarnWeight(weight, weight, tolerance);
				expect(result).toBe(false);
			}),
			{ numRuns: 100 }
		);
	});

	it('always warns when difference exceeds tolerance', () => {
		fc.assert(
			fc.property(
				positiveWeight,
				positiveTolerance,
				fc.double({ min: 0.001, max: 5_000, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, extra) => {
					// Construct a checkin weight that is guaranteed to exceed tolerance
					const checkinWeight = checkoutWeight + tolerance + extra;
					const result = shouldWarnWeight(checkoutWeight, checkinWeight, tolerance);
					expect(result).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('never warns when difference is within tolerance', () => {
		fc.assert(
			fc.property(
				positiveWeight,
				positiveTolerance,
				fc.double({ min: 0, max: 0.99, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, fraction) => {
					// Construct a checkin weight strictly within tolerance
					const diff = tolerance * fraction;
					const checkinWeight = checkoutWeight + diff;
					// Guard against floating-point edge cases where the actual diff exceeds tolerance
					if (Math.abs(checkinWeight - checkoutWeight) > tolerance) return;
					const result = shouldWarnWeight(checkoutWeight, checkinWeight, tolerance);
					expect(result).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('is symmetric: swapping checkout and checkin weights gives the same result', () => {
		fc.assert(
			fc.property(positiveWeight, positiveWeight, positiveTolerance, (w1, w2, tolerance) => {
				expect(shouldWarnWeight(w1, w2, tolerance)).toBe(shouldWarnWeight(w2, w1, tolerance));
			}),
			{ numRuns: 100 }
		);
	});
});
