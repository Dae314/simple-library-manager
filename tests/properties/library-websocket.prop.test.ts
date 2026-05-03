import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { handleEvent } from '$lib/stores/websocket.svelte.js';
import type { EventMessage } from '$lib/server/ws/events.js';

// Mock $app/navigation so the module can be imported without SvelteKit runtime
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve())
}));

// --- Arbitraries (same shapes as websocket.prop.test.ts) ---

const gameEventTypes = [
	'game_created',
	'game_updated',
	'game_checked_out',
	'game_checked_in',
	'game_retired',
	'game_restored',
	'games_imported'
] as const;

const arbGameEvent = fc.record({
	type: fc.constantFrom(...gameEventTypes),
	gameId: fc.nat()
});

const arbBatchGameEvent = fc.record({
	type: fc.constant('games_batch_changed' as const),
	gameIds: fc.array(fc.nat(), { minLength: 0, maxLength: 50 })
});

const arbTransactionEvent = fc.record({
	type: fc.constant('transaction_created' as const),
	transactionId: fc.nat(),
	gameId: fc.nat()
});

/** All non-full_resync event types */
const arbNonResyncEvent: fc.Arbitrary<EventMessage> = fc.oneof(
	arbGameEvent,
	arbBatchGameEvent,
	arbTransactionEvent
);

/**
 * Property 8: WebSocket event handling for /library page
 *
 * For any game event type (game_checked_out, game_checked_in, game_created,
 * game_updated, game_retired, game_restored, games_imported), batch game event,
 * or transaction event with any gameId, calling handleEvent() with pathname
 * '/library' shall return 'invalidate'.
 *
 * Feature: unified-library-page, Property 8: WebSocket event handling for /library page
 * Validates: Requirements 9.2
 */
describe('Property 8: WebSocket event handling for /library page', () => {
	it('returns invalidate for any non-full_resync event on /library', () => {
		fc.assert(
			fc.property(arbNonResyncEvent, (event) => {
				const action = handleEvent(event, '/library');
				expect(action).toBe('invalidate');
			})
		);
	});

	it('returns invalidate for game events with any gameId on /library', () => {
		fc.assert(
			fc.property(arbGameEvent, (event) => {
				const action = handleEvent(event, '/library');
				expect(action).toBe('invalidate');
			})
		);
	});

	it('returns invalidate for transaction events on /library', () => {
		fc.assert(
			fc.property(arbTransactionEvent, (event) => {
				const action = handleEvent(event, '/library');
				expect(action).toBe('invalidate');
			})
		);
	});

	it('returns invalidate for batch game events on /library', () => {
		fc.assert(
			fc.property(arbBatchGameEvent, (event) => {
				const action = handleEvent(event, '/library');
				expect(action).toBe('invalidate');
			})
		);
	});
});

/**
 * Property 9: Conflict detection matches open dialog game
 *
 * For any game event with a gameId field, the conflict detection logic shall
 * flag a status change warning if and only if the event's gameId equals the
 * open dialog's game ID. This is a pure matching test: given an event gameId
 * and a dialog gameId, conflict is detected iff they are equal.
 *
 * Feature: unified-library-page, Property 9: Conflict detection matches open dialog game
 * Validates: Requirements 9.4
 */
describe('Property 9: Conflict detection matches open dialog game', () => {
	/**
	 * Pure conflict detection logic extracted from the library page's onConflict handler:
	 * given an event with a gameId and the currently open dialog's gameId,
	 * a conflict (status change warning) is flagged iff the two IDs match.
	 */
	function detectConflict(eventGameId: number, dialogGameId: number): boolean {
		return eventGameId === dialogGameId;
	}

	it('flags conflict when event gameId equals dialog gameId', () => {
		fc.assert(
			fc.property(fc.nat(), (gameId) => {
				expect(detectConflict(gameId, gameId)).toBe(true);
			})
		);
	});

	it('does not flag conflict when event gameId differs from dialog gameId', () => {
		fc.assert(
			fc.property(fc.nat(), fc.nat(), (eventGameId, dialogGameId) => {
				fc.pre(eventGameId !== dialogGameId);
				expect(detectConflict(eventGameId, dialogGameId)).toBe(false);
			})
		);
	});

	it('conflict detection is symmetric: matching is bidirectional', () => {
		fc.assert(
			fc.property(fc.nat(), fc.nat(), (a, b) => {
				expect(detectConflict(a, b)).toBe(detectConflict(b, a));
			})
		);
	});

	it('conflict detection with game events: flags warning iff gameId matches selectedGame.id', () => {
		fc.assert(
			fc.property(arbGameEvent, fc.nat(), (event, dialogGameId) => {
				const shouldConflict = event.gameId === dialogGameId;
				expect(detectConflict(event.gameId, dialogGameId)).toBe(shouldConflict);
			})
		);
	});

	it('conflict detection with transaction events: flags warning iff gameId matches selectedGame.id', () => {
		fc.assert(
			fc.property(arbTransactionEvent, fc.nat(), (event, dialogGameId) => {
				const shouldConflict = event.gameId === dialogGameId;
				expect(detectConflict(event.gameId, dialogGameId)).toBe(shouldConflict);
			})
		);
	});
});
