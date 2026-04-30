import { connectionManager } from './connection-manager.js';
import type { GameEventMessage } from './events.js';

/** Broadcast a single game change event. */
export function broadcastGameEvent(type: GameEventMessage['type'], gameId: number): void {
	connectionManager.broadcast({ type, gameId });
}

/** Broadcast a batch game change event (CSV import, bulk retire). */
export function broadcastBatchGameEvent(gameIds: number[]): void {
	connectionManager.broadcast({ type: 'games_batch_changed', gameIds });
}

/** Broadcast a transaction creation event. */
export function broadcastTransactionEvent(transactionId: number, gameId: number): void {
	connectionManager.broadcast({ type: 'transaction_created', transactionId, gameId });
}

/** Broadcast a full resync event (after backup restore). */
export function broadcastFullResync(): void {
	connectionManager.broadcast({ type: 'full_resync' });
}
