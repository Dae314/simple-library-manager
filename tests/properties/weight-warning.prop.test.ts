import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getWeightWarningLevel, shouldWarnWeight } from '$lib/server/validation.js';

/**
 * Property 7: Weight warning correctness (granular levels)
 *
 * The weight warning system uses three levels:
 * - 'red': absolute difference exceeds the configured tolerance
 * - 'yellow': difference is between 0.1 and tolerance (exclusive of both boundaries)
 * - 'none': difference is within 0.1 (the static minor warning threshold)
 *
 * **Validates: Requirements 5.7**
 */
describe('Property 7: Weight warning correctness', () => {
	const positiveWeight = fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true });
	const positiveTolerance = fc.double({ min: 0.001, max: 1_000, noNaN: true, noDefaultInfinity: true });

	it('returns red when difference exceeds tolerance', () => {
		fc.assert(
			fc.property(
				positiveWeight,
				positiveTolerance,
				fc.double({ min: 0.001, max: 5_000, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, extra) => {
					const checkinWeight = checkoutWeight + tolerance + extra;
					const result = getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance);
					expect(result).toBe('red');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('never returns red when difference is within tolerance', () => {
		fc.assert(
			fc.property(
				positiveWeight,
				positiveTolerance,
				fc.double({ min: 0, max: 0.99, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, fraction) => {
					const diff = tolerance * fraction;
					const checkinWeight = checkoutWeight + diff;
					// Guard against floating-point edge cases
					if (Math.abs(checkinWeight - checkoutWeight) > tolerance) return;
					const result = getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance);
					expect(result).not.toBe('red');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('returns none when checkout and checkin weights are identical', () => {
		fc.assert(
			fc.property(positiveWeight, positiveTolerance, (weight, tolerance) => {
				const result = getWeightWarningLevel(weight, weight, tolerance);
				expect(result).toBe('none');
			}),
			{ numRuns: 100 }
		);
	});

	it('returns none when difference is within 0.1 (static threshold)', () => {
		fc.assert(
			fc.property(
				positiveWeight,
				positiveTolerance,
				fc.double({ min: 0, max: 0.99, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, fraction) => {
					// Construct a checkin weight within 0.1
					const diff = 0.1 * fraction;
					const checkinWeight = checkoutWeight + diff;
					const actualDiff = Math.abs(checkinWeight - checkoutWeight);
					// Guard: must actually be within 0.1 AND within tolerance
					// (if tolerance < 0.1, red takes priority)
					if (actualDiff > 0.1) return;
					if (actualDiff > tolerance) return;
					const result = getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance);
					expect(result).toBe('none');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('returns yellow when difference is between 0.1 and tolerance', () => {
		fc.assert(
			fc.property(
				positiveWeight,
				// Tolerance must be > 0.1 for a yellow zone to exist
				fc.double({ min: 0.2, max: 100, noNaN: true, noDefaultInfinity: true }),
				fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, fraction) => {
					// Only test when 0.1 < tolerance (otherwise yellow zone doesn't exist)
					if (0.1 >= tolerance) return;
					// Construct a difference in the yellow zone: between 0.1 and tolerance
					const yellowRange = tolerance - 0.1;
					const diff = 0.1 + yellowRange * fraction;
					const checkinWeight = checkoutWeight + diff;
					// Guard against floating-point edge cases
					const actualDiff = Math.abs(checkinWeight - checkoutWeight);
					if (actualDiff <= 0.1 || actualDiff > tolerance) return;
					const result = getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance);
					expect(result).toBe('yellow');
				}
			),
			{ numRuns: 500 }
		);
	});

	it('is symmetric: swapping checkout and checkin gives the same warning level', () => {
		fc.assert(
			fc.property(positiveWeight, positiveWeight, positiveTolerance, (w1, w2, tolerance) => {
				const r1 = getWeightWarningLevel(w1, w2, tolerance);
				const r2 = getWeightWarningLevel(w2, w1, tolerance);
				// All levels are symmetric since the function uses absolute difference
				expect(r1).toBe(r2);
			}),
			{ numRuns: 100 }
		);
	});

	it('shouldWarnWeight returns true for red and yellow, false for none', () => {
		fc.assert(
			fc.property(positiveWeight, positiveWeight, positiveTolerance, (checkoutWeight, checkinWeight, tolerance) => {
				const level = getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance);
				const warns = shouldWarnWeight(checkoutWeight, checkinWeight, tolerance);
				if (level === 'none') {
					expect(warns).toBe(false);
				} else {
					expect(warns).toBe(true);
				}
			}),
			{ numRuns: 1000 }
		);
	});
});
