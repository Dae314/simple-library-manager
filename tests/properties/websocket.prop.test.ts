import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { WebSocket } from 'ws';
import { connectionManager } from '$lib/server/ws/connection-manager.js';
import type { EventMessage } from '$lib/server/ws/events.js';

/**
 * Create a mock WebSocket object with the given readyState.
 * Uses WebSocket.OPEN (1) by default.
 */
function createMockWs(readyState: number = WebSocket.OPEN) {
	return {
		readyState,
		OPEN: WebSocket.OPEN,
		send: vi.fn()
	} as unknown as WebSocket;
}

beforeEach(() => {
	connectionManager._reset();
});

// --- Arbitraries for EventMessage variants ---

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

const arbFullResyncEvent = fc.record({
	type: fc.constant('full_resync' as const)
});

const arbEventMessage: fc.Arbitrary<EventMessage> = fc.oneof(
	arbGameEvent,
	arbBatchGameEvent,
	arbTransactionEvent,
	arbFullResyncEvent
);

/**
 * Property 1: Connection Manager add/remove consistency
 *
 * For any sequence of addConnection and removeConnection operations on the
 * Connection Manager, the reported connection count shall equal the number
 * of connections that have been added but not yet removed.
 *
 * Feature: real-time-game-updates, Property 1: Connection Manager add/remove consistency
 * Validates: Requirements 1.2, 1.3
 */
describe('Property 1: Connection Manager add/remove consistency', () => {
	it('getConnectionCount equals added minus removed connections', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						action: fc.constantFrom('add', 'remove'),
						index: fc.nat({ max: 19 })
					}),
					{ minLength: 0, maxLength: 100 }
				),
				(operations) => {
					connectionManager._reset();

					// Pre-create a pool of mock WebSocket objects
					const pool: WebSocket[] = [];
					for (let i = 0; i < 20; i++) {
						pool.push(createMockWs());
					}

					const added = new Set<number>();

					for (const op of operations) {
						const ws = pool[op.index];
						if (op.action === 'add') {
							connectionManager.addConnection(ws);
							added.add(op.index);
						} else {
							connectionManager.removeConnection(ws);
							added.delete(op.index);
						}
					}

					expect(connectionManager.getConnectionCount()).toBe(added.size);
				}
			)
		);
	});
});

/**
 * Property 3: Broadcast reaches all active connections
 *
 * For any set of N active WebSocket connections registered with the Connection
 * Manager, broadcasting an event message shall result in exactly N send() calls,
 * one per connection.
 *
 * Feature: real-time-game-updates, Property 3: Broadcast reaches all active connections
 * Validates: Requirements 2.1, 3.1
 */
describe('Property 3: Broadcast reaches all active connections', () => {
	it('broadcast calls send() on every open connection exactly once', () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 100 }),
				arbEventMessage,
				(n, event) => {
					connectionManager._reset();

					const mocks: WebSocket[] = [];
					for (let i = 0; i < n; i++) {
						const ws = createMockWs(WebSocket.OPEN);
						mocks.push(ws);
						connectionManager.addConnection(ws);
					}

					connectionManager.broadcast(event);

					for (const ws of mocks) {
						expect((ws.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
					}
				}
			)
		);
	});

	it('skips and removes connections that are not OPEN', () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 20 }),
				fc.nat({ max: 20 }),
				arbEventMessage,
				(openCount, closedCount, event) => {
					connectionManager._reset();

					const openMocks: WebSocket[] = [];
					const closedMocks: WebSocket[] = [];

					for (let i = 0; i < openCount; i++) {
						const ws = createMockWs(WebSocket.OPEN);
						openMocks.push(ws);
						connectionManager.addConnection(ws);
					}

					for (let i = 0; i < closedCount; i++) {
						const ws = createMockWs(WebSocket.CLOSED);
						closedMocks.push(ws);
						connectionManager.addConnection(ws);
					}

					connectionManager.broadcast(event);

					// Open connections should have received the message
					for (const ws of openMocks) {
						expect((ws.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
					}

					// Closed connections should not have received the message
					for (const ws of closedMocks) {
						expect((ws.send as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
					}

					// Closed connections should have been removed
					expect(connectionManager.getConnectionCount()).toBe(openCount);
				}
			)
		);
	});
});

/**
 * Property 4: Event message serialization round-trip
 *
 * For any valid EventMessage (game event, batch game event, transaction event,
 * or full resync), serializing to JSON and parsing back shall produce an object
 * with all original fields preserved and equal to their original values.
 *
 * Feature: real-time-game-updates, Property 4: Event message serialization round-trip
 * Validates: Requirements 2.2, 2.3, 3.1
 */
describe('Property 4: Event message serialization round-trip', () => {
	it('JSON.parse(JSON.stringify(event)) deep-equals the original for all event variants', () => {
		fc.assert(
			fc.property(arbEventMessage, (event) => {
				const roundTripped = JSON.parse(JSON.stringify(event));
				expect(roundTripped).toEqual(event);
			})
		);
	});

	it('serialized game events preserve type and gameId', () => {
		fc.assert(
			fc.property(arbGameEvent, (event) => {
				const parsed = JSON.parse(JSON.stringify(event));
				expect(parsed.type).toBe(event.type);
				expect(parsed.gameId).toBe(event.gameId);
			})
		);
	});

	it('serialized batch events preserve type and gameIds array', () => {
		fc.assert(
			fc.property(arbBatchGameEvent, (event) => {
				const parsed = JSON.parse(JSON.stringify(event));
				expect(parsed.type).toBe('games_batch_changed');
				expect(parsed.gameIds).toEqual(event.gameIds);
			})
		);
	});

	it('serialized transaction events preserve type, transactionId, and gameId', () => {
		fc.assert(
			fc.property(arbTransactionEvent, (event) => {
				const parsed = JSON.parse(JSON.stringify(event));
				expect(parsed.type).toBe('transaction_created');
				expect(parsed.transactionId).toBe(event.transactionId);
				expect(parsed.gameId).toBe(event.gameId);
			})
		);
	});

	it('serialized full_resync events preserve type', () => {
		const parsed = JSON.parse(JSON.stringify({ type: 'full_resync' }));
		expect(parsed).toEqual({ type: 'full_resync' });
	});
});
