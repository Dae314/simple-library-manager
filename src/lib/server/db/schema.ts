import {
	pgTable,
	serial,
	text,
	integer,
	real,
	boolean,
	timestamp,
	date,
	index,
	uniqueIndex,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const conventionConfig = pgTable('convention_config', {
	id: serial('id').primaryKey(),
	conventionName: text('convention_name').notNull().default('Board Game Library'),
	startDate: date('start_date'),
	endDate: date('end_date'),
	weightTolerance: real('weight_tolerance').notNull().default(0.5),
	weightUnit: text('weight_unit').notNull().default('oz'),
	passwordHash: text('password_hash'),
	version: integer('version').notNull().default(1)
});

export const idTypes = pgTable('id_types', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique()
});

export const attendees = pgTable(
	'attendees',
	{
		id: serial('id').primaryKey(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		idType: text('id_type').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('idx_attendees_name_unique').on(
			sql`LOWER(TRIM(${table.firstName}))`,
			sql`LOWER(TRIM(${table.lastName}))`
		),
		index('idx_attendees_first_name').on(table.firstName),
		index('idx_attendees_last_name').on(table.lastName)
	]
);

export const games = pgTable(
	'games',
	{
		id: serial('id').primaryKey(),
		title: text('title').notNull(),
		bggId: integer('bgg_id').notNull(),
		copyNumber: integer('copy_number').notNull(),
		status: text('status').notNull().default('available'),
		prizeType: text('prize_type').notNull().default('standard'),
		shelfCategory: text('shelf_category').notNull().default('standard'),
		version: integer('version').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('idx_games_bgg_id').on(table.bggId),
		index('idx_games_status').on(table.status),
		index('idx_games_prize_type').on(table.prizeType),
		index('idx_games_shelf_category').on(table.shelfCategory)
	]
);

export const transactions = pgTable(
	'transactions',
	{
		id: serial('id').primaryKey(),
		gameId: integer('game_id')
			.notNull()
			.references(() => games.id),
		type: text('type').notNull(),
		attendeeFirstName: text('attendee_first_name'),
		attendeeLastName: text('attendee_last_name'),
		idType: text('id_type'),
		attendeeId: integer('attendee_id').references(() => attendees.id, { onDelete: 'cascade' }),
		checkoutWeight: real('checkout_weight'),
		checkinWeight: real('checkin_weight'),
		note: text('note'),
		isCorrection: boolean('is_correction').notNull().default(false),
		relatedTransactionId: integer('related_transaction_id').references((): AnyPgColumn => transactions.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('idx_transactions_game_id').on(table.gameId),
		index('idx_transactions_type').on(table.type),
		index('idx_transactions_created_at').on(table.createdAt),
		index('idx_transactions_attendee').on(table.attendeeFirstName, table.attendeeLastName),
		index('idx_transactions_attendee_id').on(table.attendeeId)
	]
);
