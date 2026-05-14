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
	| 'attendee_created'
	| 'attendee_updated'
	| 'attendee_deleted'
	| 'full_resync';

export interface GameEventMessage {
	type: Exclude<EventType, 'games_batch_changed' | 'transaction_created' | 'attendee_created' | 'attendee_updated' | 'attendee_deleted' | 'full_resync'>;
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

export interface AttendeeEventMessage {
	type: 'attendee_created' | 'attendee_updated' | 'attendee_deleted';
	attendeeId: number;
}

export type EventMessage =
	| GameEventMessage
	| BatchGameEventMessage
	| TransactionEventMessage
	| AttendeeEventMessage
	| FullResyncMessage;
