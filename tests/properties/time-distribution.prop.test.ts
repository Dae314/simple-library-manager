import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { determineGranularity } from '$lib/server/services/statistics.js';

/**
 * Tests for the time distribution granularity logic.
 *
 * The determineGranularity function picks the chart bucket size based on
 * how many calendar days the date range spans:
 * - 1 calendar day → 'hourly'
 * - 2–7 calendar days → 'block' (6-hour blocks per day)
 * - 8+ calendar days → 'daily'
 * - null/invalid dates → 'daily' (safe fallback)
 */
describe('determineGranularity', () => {
	describe('null/invalid inputs default to daily', () => {
		it('returns daily when both dates are null', () => {
			expect(determineGranularity(null, null)).toBe('daily');
		});

		it('returns daily when start is null', () => {
			expect(determineGranularity(null, new Date('2025-05-01'))).toBe('daily');
		});

		it('returns daily when end is null', () => {
			expect(determineGranularity(new Date('2025-05-01'), null)).toBe('daily');
		});

		it('returns daily for invalid dates', () => {
			expect(determineGranularity(new Date('invalid'), new Date('2025-05-01'))).toBe('daily');
			expect(determineGranularity(new Date('2025-05-01'), new Date('invalid'))).toBe('daily');
		});
	});

	describe('single calendar day → hourly', () => {
		it('same date, same time', () => {
			const d = new Date('2025-05-01T12:00:00');
			expect(determineGranularity(d, d)).toBe('hourly');
		});

		it('same date, start of day to end of day', () => {
			const start = new Date('2025-05-01T00:00:00');
			const end = new Date('2025-05-01T23:59:59.999');
			expect(determineGranularity(start, end)).toBe('hourly');
		});

		it('same date, arbitrary times within the day', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 23 }),
					fc.integer({ min: 0, max: 59 }),
					fc.integer({ min: 0, max: 23 }),
					fc.integer({ min: 0, max: 59 }),
					(h1, m1, h2, m2) => {
						const start = new Date(2025, 4, 1, Math.min(h1, h2), m1);
						const end = new Date(2025, 4, 1, Math.max(h1, h2), m2);
						expect(determineGranularity(start, end)).toBe('hourly');
					}
				)
			);
		});
	});

	describe('2–7 calendar days → block', () => {
		it('exactly 2 calendar days', () => {
			const start = new Date('2025-05-01T08:00:00');
			const end = new Date('2025-05-02T20:00:00');
			expect(determineGranularity(start, end)).toBe('block');
		});

		it('exactly 7 calendar days', () => {
			const start = new Date('2025-05-01T00:00:00');
			const end = new Date('2025-05-07T23:59:59');
			expect(determineGranularity(start, end)).toBe('block');
		});

		it('convention-length ranges (3-5 days) are block', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 2, max: 6 }),
					(extraDays) => {
						const start = new Date('2025-05-01T00:00:00');
						const end = new Date(start);
						end.setDate(end.getDate() + extraDays);
						end.setHours(23, 59, 59, 999);
						expect(determineGranularity(start, end)).toBe('block');
					}
				)
			);
		});
	});

	describe('8+ calendar days → daily', () => {
		it('exactly 8 calendar days', () => {
			const start = new Date('2025-05-01T00:00:00');
			const end = new Date('2025-05-08T23:59:59');
			expect(determineGranularity(start, end)).toBe('daily');
		});

		it('large ranges are daily', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 7, max: 365 }),
					(extraDays) => {
						const start = new Date('2025-01-01T00:00:00');
						const end = new Date(start);
						end.setDate(end.getDate() + extraDays);
						expect(determineGranularity(start, end)).toBe('daily');
					}
				)
			);
		});
	});

	describe('convention day scenario (single day)', () => {
		it('a convention day normalized to start/end of same day is hourly', () => {
			// Simulates what calcTimeDistribution does for a convention day
			const conventionStart = new Date('2025-05-01');
			const dayNumber = 3; // Day 3 of convention

			const start = new Date(conventionStart);
			start.setDate(start.getDate() + (dayNumber - 1));
			start.setHours(0, 0, 0, 0);
			const end = new Date(start);
			end.setHours(23, 59, 59, 999);

			expect(determineGranularity(start, end)).toBe('hourly');
		});
	});

	describe('no-filter scenario (data-derived range)', () => {
		it('multi-day data span picks block or daily, never hourly', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 30 }),
					(spanDays) => {
						// Simulates deriving range from MIN/MAX of actual data
						const minDate = new Date('2025-05-01T09:30:00');
						const maxDate = new Date(minDate);
						maxDate.setDate(maxDate.getDate() + spanDays);
						maxDate.setHours(16, 45, 0, 0);

						// Normalize like the service does
						const rangeStart = new Date(minDate);
						rangeStart.setHours(0, 0, 0, 0);
						const rangeEnd = new Date(maxDate);
						rangeEnd.setHours(23, 59, 59, 999);

						const result = determineGranularity(rangeStart, rangeEnd);
						expect(result).not.toBe('hourly');
					}
				)
			);
		});
	});
});
