import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getWeightWarningLevel, shouldWarnWeight } from '$lib/server/validation.js';

/**
 * Property 7: Weight warning correctness (granular levels)
 *
 * The weight warning system uses three levels:
 * - 'red': absolute difference exceeds the configured tolerance
 * - 'yellow': difference is between 2% of checkout weight and tolerance
 * - 'none': difference is within 2% of checkout weight
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

	it('returns none when difference is within 2% of checkout weight', () => {
		fc.assert(
			fc.property(
				// Use weights large enough that 2% is meaningful
				fc.double({ min: 1, max: 10_000, noNaN: true, noDefaultInfinity: true }),
				positiveTolerance,
				fc.double({ min: 0, max: 0.99, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, fraction) => {
					const twoPercent = checkoutWeight * 0.02;
					// Construct a checkin weight within 2%
					const diff = twoPercent * fraction;
					const checkinWeight = checkoutWeight + diff;
					// Guard: must actually be within 2% and within tolerance
					if (Math.abs(checkinWeight - checkoutWeight) > twoPercent) return;
					if (Math.abs(checkinWeight - checkoutWeight) > tolerance) return;
					const result = getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance);
					expect(result).toBe('none');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('returns yellow when difference is between 2% and tolerance', () => {
		fc.assert(
			fc.property(
				// Use weights where 2% < tolerance is achievable
				fc.double({ min: 1, max: 1_000, noNaN: true, noDefaultInfinity: true }),
				fc.double({ min: 0.5, max: 100, noNaN: true, noDefaultInfinity: true }),
				fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
				(checkoutWeight, tolerance, fraction) => {
					const twoPercent = checkoutWeight * 0.02;
					// Only test when 2% < tolerance (otherwise yellow zone doesn't exist)
					if (twoPercent >= tolerance) return;
					// Construct a difference in the yellow zone: between 2% and tolerance
					const yellowRange = tolerance - twoPercent;
					const diff = twoPercent + yellowRange * fraction;
					const checkinWeight = checkoutWeight + diff;
					// Guard against floating-point edge cases
					const actualDiff = Math.abs(checkinWeight - checkoutWeight);
					if (actualDiff <= twoPercent || actualDiff > tolerance) return;
					const result = getWeightWarningLevel(checkoutWeight, checkinWeight, tolerance);
					expect(result).toBe('yellow');
				}
			),
			{ numRuns: 500 }
		);
	});

	it('is symmetric for red level: swapping checkout and checkin gives same red result', () => {
		fc.assert(
			fc.property(positiveWeight, positiveWeight, positiveTolerance, (w1, w2, tolerance) => {
				const r1 = getWeightWarningLevel(w1, w2, tolerance);
				const r2 = getWeightWarningLevel(w2, w1, tolerance);
				// Red should be symmetric (both depend only on absolute difference vs tolerance)
				if (r1 === 'red') expect(r2).toBe('red');
				if (r2 === 'red') expect(r1).toBe('red');
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
