export type EventType =
	| 'game_created'
	| 'game_updated'
	| 'game_deleted'
	| 'game_checked_out'
	| 'game_checked_in'
	| 'game_retired'
	| 'game_restored'
	| 'games_imported'
	| 'games_batch_changed'
	| 'transaction_created'
	| 'full_resync';

export interface GameEventMessage {
	type: Exclude<EventType, 'games_batch_changed' | 'transaction_created' | 'full_resync'>;
	gameId: number;
}

export interface BatchGameEventMessage {
	type: 'games_batch_changed';
	gameIds: number[];
}

export interface TransactionEventMessage {
	type: 'transaction_created';
	transactionId: number;
	gameId: number;
}

export interface FullResyncMessage {
	type: 'full_resync';
}

export type EventMessage =
	| GameEventMessage
	| BatchGameEventMessage
	| TransactionEventMessage
	| FullResyncMessage;
