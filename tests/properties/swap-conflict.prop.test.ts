import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: attendee-tracking-swaps-categories, Property 13: Swap conflict detection (two-game monitoring)
 *
 * For any WebSocket event with a gameId matching either the return game ID or the selected
 * new game ID, the swap dialog conflict handler SHALL return a conflict action. Events with
 * game IDs not matching either game SHALL not trigger a conflict.
 *
 * **Validates: Requirements 6.2, 6.5**
 */

/**
 * Pure conflict detection logic extracted from SwapDialog's onConflict handler.
 * Given an event (which may or may not have a gameId), the return game ID, and
 * the selected new game ID (which may be null if no game is selected yet),
 * determines whether a conflict should be flagged.
 */
function detectSwapConflict(
	event: { gameId?: number },
	returnGameId: number,
	selectedNewGameId: number | null
): boolean {
	if (event.gameId === undefined) return false;
	if (event.gameId === returnGameId) return true;
	if (selectedNewGameId !== null && event.gameId === selectedNewGameId) return true;
	return false;
}

// --- Arbitraries ---

/** Arbitrary for a game ID (non-negative integer) */
const arbGameId = fc.nat({ max: 100000 });

/** Arbitrary for an event with a gameId */
const arbEventWithGameId = fc.record({
	gameId: arbGameId
});

/** Arbitrary for an event without a gameId */
const arbEventWithoutGameId: fc.Arbitrary<{ gameId?: number }> = fc.constant({});

/** Arbitrary for selectedNewGameId (either a number or null) */
const arbSelectedNewGameId = fc.option(arbGameId, { nil: null });

describe('Property 13: Swap conflict detection (two-game monitoring)', () => {
	it('detects conflict when event gameId matches returnGameId', () => {
		fc.assert(
			fc.property(arbGameId, arbSelectedNewGameId, (returnGameId, selectedNewGameId) => {
				const event = { gameId: returnGameId };
				expect(detectSwapConflict(event, returnGameId, selectedNewGameId)).toBe(true);
			})
		);
	});

	it('detects conflict when event gameId matches selectedNewGameId', () => {
		fc.assert(
			fc.property(arbGameId, arbGameId, (returnGameId, selectedNewGameId) => {
				// Ensure selectedNewGameId is different from returnGameId to isolate this case
				fc.pre(selectedNewGameId !== returnGameId);
				const event = { gameId: selectedNewGameId };
				expect(detectSwapConflict(event, returnGameId, selectedNewGameId)).toBe(true);
			})
		);
	});

	it('does not detect conflict when event gameId matches neither game', () => {
		fc.assert(
			fc.property(
				arbGameId,
				arbGameId,
				arbGameId,
				(eventGameId, returnGameId, selectedNewGameId) => {
					fc.pre(eventGameId !== returnGameId);
					fc.pre(eventGameId !== selectedNewGameId);
					const event = { gameId: eventGameId };
					expect(detectSwapConflict(event, returnGameId, selectedNewGameId)).toBe(false);
				}
			)
		);
	});

	it('does not detect conflict when event has no gameId', () => {
		fc.assert(
			fc.property(arbGameId, arbSelectedNewGameId, (returnGameId, selectedNewGameId) => {
				const event: { gameId?: number } = {};
				expect(detectSwapConflict(event, returnGameId, selectedNewGameId)).toBe(false);
			})
		);
	});

	it('when selectedNewGameId is null, only returnGameId triggers conflict', () => {
		fc.assert(
			fc.property(arbGameId, arbGameId, (eventGameId, returnGameId) => {
				const selectedNewGameId = null;
				const result = detectSwapConflict({ gameId: eventGameId }, returnGameId, selectedNewGameId);
				expect(result).toBe(eventGameId === returnGameId);
			})
		);
	});
});
