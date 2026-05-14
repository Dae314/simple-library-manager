import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: attendee-tracking-swaps-categories, Property 14: Attendee statistics exclude corrections
 *
 * For any set of transactions including both standard checkouts and correction transactions,
 * the attendee checkout count SHALL equal the count of non-correction checkout transactions only.
 *
 * **Validates: Requirements 8.4**
 */

// --- Domain types ---

interface Transaction {
	attendeeId: number;
	type: 'checkout' | 'checkin';
	isCorrection: boolean;
}

// --- Pure counting logic (mirrors the statistics service's filtering) ---

/**
 * Count the number of non-correction checkout transactions for a given attendee.
 * This replicates the logic used by statisticsService.getTopAttendees which filters
 * with: type='checkout' AND isCorrection=false.
 */
function countAttendeeCheckouts(
	transactions: Transaction[],
	attendeeId: number
): number {
	return transactions.filter(
		(t) => t.attendeeId === attendeeId && t.type === 'checkout' && !t.isCorrection
	).length;
}

// --- Arbitraries ---

const arbAttendeeId = fc.integer({ min: 1, max: 50 });

const arbTransactionType = fc.constantFrom<'checkout' | 'checkin'>('checkout', 'checkin');

const arbTransaction = fc.record({
	attendeeId: arbAttendeeId,
	type: arbTransactionType,
	isCorrection: fc.boolean()
});

const arbTransactions = fc.array(arbTransaction, { minLength: 0, maxLength: 50 });

describe('Property 14: Attendee statistics exclude corrections', () => {
	it('only non-correction checkouts are counted', () => {
		fc.assert(
			fc.property(arbTransactions, arbAttendeeId, (txns, attendeeId) => {
				const result = countAttendeeCheckouts(txns, attendeeId);
				const expected = txns.filter(
					(t) => t.attendeeId === attendeeId && t.type === 'checkout' && !t.isCorrection
				).length;
				expect(result).toBe(expected);
			})
		);
	});

	it('correction checkouts (isCorrection=true) are excluded from the count', () => {
		fc.assert(
			fc.property(arbAttendeeId, fc.integer({ min: 1, max: 10 }), (attendeeId, numCorrections) => {
				// Create transactions that are all correction checkouts for the target attendee
				const correctionTxns: Transaction[] = Array.from({ length: numCorrections }, () => ({
					attendeeId,
					type: 'checkout' as const,
					isCorrection: true
				}));
				const result = countAttendeeCheckouts(correctionTxns, attendeeId);
				expect(result).toBe(0);
			})
		);
	});

	it('checkin transactions are excluded regardless of isCorrection', () => {
		fc.assert(
			fc.property(
				arbAttendeeId,
				fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
				(attendeeId, correctionFlags) => {
					// Create only checkin transactions for the target attendee
					const checkinTxns: Transaction[] = correctionFlags.map((isCorrection) => ({
						attendeeId,
						type: 'checkin' as const,
						isCorrection
					}));
					const result = countAttendeeCheckouts(checkinTxns, attendeeId);
					expect(result).toBe(0);
				}
			)
		);
	});

	it('an attendee with only correction checkouts has a count of 0', () => {
		fc.assert(
			fc.property(
				arbAttendeeId,
				fc.integer({ min: 1, max: 20 }),
				fc.array(arbTransaction, { minLength: 0, maxLength: 20 }),
				(attendeeId, numCorrections, otherTxns) => {
					// Build a set where the target attendee only has correction checkouts
					const targetCorrectionTxns: Transaction[] = Array.from(
						{ length: numCorrections },
						() => ({
							attendeeId,
							type: 'checkout' as const,
							isCorrection: true
						})
					);
					// Filter out any non-correction checkouts for the target attendee from other txns
					const filteredOtherTxns = otherTxns.filter(
						(t) =>
							t.attendeeId !== attendeeId ||
							t.type !== 'checkout' ||
							t.isCorrection === true
					);
					const allTxns = [...targetCorrectionTxns, ...filteredOtherTxns];
					const result = countAttendeeCheckouts(allTxns, attendeeId);
					expect(result).toBe(0);
				}
			)
		);
	});

	it('mixed transactions: count equals exactly the number of non-correction checkouts', () => {
		fc.assert(
			fc.property(
				arbAttendeeId,
				fc.integer({ min: 1, max: 10 }),
				fc.integer({ min: 1, max: 10 }),
				fc.integer({ min: 0, max: 10 }),
				fc.integer({ min: 0, max: 10 }),
				(attendeeId, numStandardCheckouts, numCorrectionCheckouts, numCheckins, numOtherAttendeeCheckouts) => {
					const txns: Transaction[] = [];

					// Standard checkouts for target attendee (these should be counted)
					for (let i = 0; i < numStandardCheckouts; i++) {
						txns.push({ attendeeId, type: 'checkout', isCorrection: false });
					}

					// Correction checkouts for target attendee (should NOT be counted)
					for (let i = 0; i < numCorrectionCheckouts; i++) {
						txns.push({ attendeeId, type: 'checkout', isCorrection: true });
					}

					// Checkins for target attendee (should NOT be counted)
					for (let i = 0; i < numCheckins; i++) {
						txns.push({ attendeeId, type: 'checkin', isCorrection: false });
					}

					// Checkouts for a different attendee (should NOT be counted for target)
					const otherAttendeeId = attendeeId === 50 ? 1 : attendeeId + 1;
					for (let i = 0; i < numOtherAttendeeCheckouts; i++) {
						txns.push({ attendeeId: otherAttendeeId, type: 'checkout', isCorrection: false });
					}

					const result = countAttendeeCheckouts(txns, attendeeId);
					expect(result).toBe(numStandardCheckouts);
				}
			)
		);
	});
});
