import { db } from '../db/index.js';
import { games, transactions, conventionConfig } from '../db/schema.js';
import { eq, and, sql, ilike, desc, count, type SQL } from 'drizzle-orm';
import { shouldWarnWeight } from '../validation.js';
import type { PaginationParams, PaginatedResult } from './games.js';

// --- Types ---

export interface CheckoutTransaction {
	id: number;
	gameId: number;
	type: string;
	attendeeFirstName: string | null;
	attendeeLastName: string | null;
	idType: string | null;
	checkoutWeight: number | null;
	checkinWeight: number | null;
	note: string | null;
	isCorrection: boolean;
	relatedTransactionId: number | null;
	createdAt: Date;
}

export interface CheckinTransaction {
	id: number;
	gameId: number;
	type: string;
	attendeeFirstName: string | null;
	attendeeLastName: string | null;
	idType: string | null;
	checkoutWeight: number | null;
	checkinWeight: number | null;
	note: string | null;
	isCorrection: boolean;
	relatedTransactionId: number | null;
	createdAt: Date;
}

export interface WeightWarning {
	checkoutWeight: number;
	checkinWeight: number;
	difference: number;
	tolerance: number;
}

export interface TransactionFilters {
	gameTitle?: string;
	type?: 'checkout' | 'checkin';
	attendeeName?: string;
}

export interface TransactionWithGame {
	id: number;
	gameId: number;
	type: string;
	attendeeFirstName: string | null;
	attendeeLastName: string | null;
	idType: string | null;
	checkoutWeight: number | null;
	checkinWeight: number | null;
	note: string | null;
	isCorrection: boolean;
	relatedTransactionId: number | null;
	createdAt: Date;
	gameTitle: string;
}

// --- Transaction Service ---

export const transactionService = {
	/**
	 * Checkout a game with optimistic locking.
	 */
	async checkout(data: {
		gameId: number;
		gameVersion: number;
		attendeeFirstName: string;
		attendeeLastName: string;
		idType: string;
		checkoutWeight: number;
		note?: string;
	}): Promise<CheckoutTransaction> {
		return await db.transaction(async (tx) => {
			// Optimistic locking: update only if version matches and game is available
			const [updated] = await tx
				.update(games)
				.set({
					status: 'checked_out',
					version: sql`${games.version} + 1`,
					updatedAt: new Date()
				})
				.where(
					and(
						eq(games.id, data.gameId),
						eq(games.status, 'available'),
						eq(games.version, data.gameVersion)
					)
				)
				.returning();

			if (!updated) {
				throw new Error('Conflict: game was modified by another user or is not available');
			}

			// Create checkout transaction
			const [transaction] = await tx
				.insert(transactions)
				.values({
					gameId: data.gameId,
					type: 'checkout',
					attendeeFirstName: data.attendeeFirstName,
					attendeeLastName: data.attendeeLastName,
					idType: data.idType,
					checkoutWeight: data.checkoutWeight,
					note: data.note || null
				})
				.returning();

			return transaction;
		});
	},

	/**
	 * Checkin a game with weight comparison.
	 * For play_and_take games, optionally retire the game if attendee takes it.
	 */
	async checkin(data: {
		gameId: number;
		checkinWeight: number;
		note?: string;
		attendeeTakesGame?: boolean;
	}): Promise<{ transaction: CheckinTransaction; weightWarning?: WeightWarning }> {
		return await db.transaction(async (tx) => {
			// Verify game is currently checked out
			const [game] = await tx
				.select()
				.from(games)
				.where(eq(games.id, data.gameId));

			if (!game) {
				throw new Error(`Game with id ${data.gameId} not found`);
			}

			if (game.status !== 'checked_out') {
				throw new Error('Game is not currently checked out');
			}

			// Determine new status based on play_and_take logic
			const isPlayAndTake = game.gameType === 'play_and_take' && data.attendeeTakesGame === true;
			const newStatus = isPlayAndTake ? 'retired' : 'available';

			// Build note
			let note = data.note || null;
			if (isPlayAndTake) {
				const takeNote = 'Attendee chose to take the game (play_and_take)';
				note = note ? `${note} — ${takeNote}` : takeNote;
			}

			// Update game status
			await tx
				.update(games)
				.set({
					status: newStatus,
					version: sql`${games.version} + 1`,
					updatedAt: new Date()
				})
				.where(eq(games.id, data.gameId));

			// Create checkin transaction
			const [transaction] = await tx
				.insert(transactions)
				.values({
					gameId: data.gameId,
					type: 'checkin',
					checkinWeight: data.checkinWeight,
					note
				})
				.returning();

			// Find the corresponding checkout transaction to compare weights
			const [checkoutTx] = await tx
				.select()
				.from(transactions)
				.where(
					and(
						eq(transactions.gameId, data.gameId),
						eq(transactions.type, 'checkout')
					)
				)
				.orderBy(desc(transactions.createdAt))
				.limit(1);

			// Compare weights if we have a checkout weight
			let weightWarning: WeightWarning | undefined;
			if (checkoutTx?.checkoutWeight != null) {
				// Get weight tolerance from convention config
				const [config] = await tx
					.select({ weightTolerance: conventionConfig.weightTolerance })
					.from(conventionConfig)
					.where(eq(conventionConfig.id, 1));

				const tolerance = config?.weightTolerance ?? 0.5;

				if (shouldWarnWeight(checkoutTx.checkoutWeight, data.checkinWeight, tolerance)) {
					weightWarning = {
						checkoutWeight: checkoutTx.checkoutWeight,
						checkinWeight: data.checkinWeight,
						difference: Math.abs(data.checkinWeight - checkoutTx.checkoutWeight),
						tolerance
					};
				}
			}

			return { transaction, weightWarning };
		});
	},

	/**
	 * Reverse a checkout: change game status back to "available" and create a corrective checkin.
	 */
	async reverseCheckout(transactionId: number): Promise<void> {
		await db.transaction(async (tx) => {
			// Find the original checkout transaction
			const [originalTx] = await tx
				.select()
				.from(transactions)
				.where(
					and(
						eq(transactions.id, transactionId),
						eq(transactions.type, 'checkout')
					)
				);

			if (!originalTx) {
				throw new Error(`Checkout transaction with id ${transactionId} not found`);
			}

			// Verify the game is currently checked_out
			const [game] = await tx
				.select()
				.from(games)
				.where(eq(games.id, originalTx.gameId));

			if (!game || game.status !== 'checked_out') {
				throw new Error('Conflict: game is not currently checked out, cannot reverse checkout');
			}

			// Change game status back to available
			await tx
				.update(games)
				.set({
					status: 'available',
					version: sql`${games.version} + 1`,
					updatedAt: new Date()
				})
				.where(eq(games.id, originalTx.gameId));

			// Create corrective checkin transaction
			await tx.insert(transactions).values({
				gameId: originalTx.gameId,
				type: 'checkin',
				note: 'Error correction: checkout reversed',
				isCorrection: true,
				relatedTransactionId: transactionId
			});
		});
	},

	/**
	 * Reverse a checkin: change game status back to "checked_out" and create a corrective checkout.
	 */
	async reverseCheckin(transactionId: number): Promise<void> {
		await db.transaction(async (tx) => {
			// Find the original checkin transaction
			const [originalTx] = await tx
				.select()
				.from(transactions)
				.where(
					and(
						eq(transactions.id, transactionId),
						eq(transactions.type, 'checkin')
					)
				);

			if (!originalTx) {
				throw new Error(`Checkin transaction with id ${transactionId} not found`);
			}

			// Verify the game is currently available
			const [game] = await tx
				.select()
				.from(games)
				.where(eq(games.id, originalTx.gameId));

			if (!game || game.status !== 'available') {
				throw new Error('Conflict: game is not currently available, cannot reverse checkin');
			}

			// Change game status back to checked_out
			await tx
				.update(games)
				.set({
					status: 'checked_out',
					version: sql`${games.version} + 1`,
					updatedAt: new Date()
				})
				.where(eq(games.id, originalTx.gameId));

			// Create corrective checkout transaction
			await tx.insert(transactions).values({
				gameId: originalTx.gameId,
				type: 'checkout',
				note: 'Error correction: checkin reversed',
				isCorrection: true,
				relatedTransactionId: transactionId
			});
		});
	},

	/**
	 * List transactions with filters and pagination.
	 * Returns chronologically ordered (most recent first) results with game title.
	 */
	async list(
		filters: TransactionFilters = {},
		pagination: PaginationParams = { page: 1, pageSize: 20 }
	): Promise<PaginatedResult<TransactionWithGame>> {
		const conditions: SQL[] = [];

		if (filters.type) {
			conditions.push(eq(transactions.type, filters.type));
		}

		if (filters.attendeeName) {
			const search = `%${filters.attendeeName}%`;
			conditions.push(
				sql`(${ilike(transactions.attendeeFirstName, search)} OR ${ilike(transactions.attendeeLastName, search)})`
			);
		}

		if (filters.gameTitle) {
			conditions.push(ilike(games.title, `%${filters.gameTitle}%`));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Count total
		const [{ total }] = await db
			.select({ total: count() })
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(whereClause);

		// Fetch paginated results
		const items = await db
			.select({
				id: transactions.id,
				gameId: transactions.gameId,
				type: transactions.type,
				attendeeFirstName: transactions.attendeeFirstName,
				attendeeLastName: transactions.attendeeLastName,
				idType: transactions.idType,
				checkoutWeight: transactions.checkoutWeight,
				checkinWeight: transactions.checkinWeight,
				note: transactions.note,
				isCorrection: transactions.isCorrection,
				relatedTransactionId: transactions.relatedTransactionId,
				createdAt: transactions.createdAt,
				gameTitle: games.title
			})
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(whereClause)
			.orderBy(desc(transactions.createdAt))
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	}
};
