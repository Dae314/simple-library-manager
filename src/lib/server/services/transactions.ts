import { db } from '../db/index.js';
import { games, transactions, conventionConfig } from '../db/schema.js';
import { eq, and, sql, ilike, desc, asc, count, type SQL } from 'drizzle-orm';
import { shouldWarnWeight, getWeightWarningLevel } from '../validation.js';
import type { WeightWarningLevel } from '../validation.js';
import type { PaginationParams, PaginatedResult } from './games.js';
import { attendeeService } from './attendees.js';
import { broadcastGameEvent, broadcastTransactionEvent } from '../ws/broadcast.js';

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
	level: WeightWarningLevel;
}

export interface TransactionFilters {
	gameTitle?: string;
	type?: 'checkout' | 'checkin';
	attendeeName?: string;
}

export interface TransactionSortParams {
	field: 'created_at' | 'game_title' | 'type' | 'attendee';
	direction: 'asc' | 'desc';
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

			// Upsert attendee (always for normal checkouts, never for corrections)
			const attendeeId = await attendeeService.upsert({
				firstName: data.attendeeFirstName,
				lastName: data.attendeeLastName,
				idType: data.idType
			});

			// Create checkout transaction
			const [transaction] = await tx
				.insert(transactions)
				.values({
					gameId: data.gameId,
					type: 'checkout',
					attendeeFirstName: data.attendeeFirstName,
					attendeeLastName: data.attendeeLastName,
					idType: data.idType,
					attendeeId,
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
			const isPlayAndTake = game.prizeType === 'play_and_take' && data.attendeeTakesGame === true;
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

			// Update checkin transaction with attendee info from checkout
			if (checkoutTx) {
				await tx
					.update(transactions)
					.set({
						attendeeFirstName: checkoutTx.attendeeFirstName,
						attendeeLastName: checkoutTx.attendeeLastName,
						idType: checkoutTx.idType,
						checkoutWeight: checkoutTx.checkoutWeight
					})
					.where(eq(transactions.id, transaction.id));
			}

			// Compare weights if we have a checkout weight
			let weightWarning: WeightWarning | undefined;
			if (checkoutTx?.checkoutWeight != null) {
				// Get weight tolerance from convention config
				const [config] = await tx
					.select({ weightTolerance: conventionConfig.weightTolerance })
					.from(conventionConfig)
					.where(eq(conventionConfig.id, 1));

				const tolerance = config?.weightTolerance ?? 0.5;
				const level = getWeightWarningLevel(checkoutTx.checkoutWeight, data.checkinWeight, tolerance);

				if (level !== 'none') {
					weightWarning = {
						checkoutWeight: checkoutTx.checkoutWeight,
						checkinWeight: data.checkinWeight,
						difference: Math.abs(data.checkinWeight - checkoutTx.checkoutWeight),
						tolerance,
						level
					};
				}
			}

			return { transaction, weightWarning };
		});
	},

	/**
	 * Atomically swap: checkin returnGame, checkout newGame to same attendee.
	 * Records standard checkin and checkout transactions. Performs weight comparison on checkin.
	 * Broadcasts WebSocket events for both games.
	 */
	async swap(data: {
		returnGameId: number;
		newGameId: number;
		checkinWeight: number;
		checkoutWeight: number;
	}): Promise<{
		checkinTransaction: CheckinTransaction;
		checkoutTransaction: CheckoutTransaction;
		weightWarning?: WeightWarning;
	}> {
		// 1. Verify return game is checked_out
		const [returnGame] = await db
			.select()
			.from(games)
			.where(eq(games.id, data.returnGameId));

		if (!returnGame) {
			throw new Error(`Game with id ${data.returnGameId} not found`);
		}
		if (returnGame.status !== 'checked_out') {
			throw new Error('Return game is not currently checked out');
		}

		// 2. Verify new game is available
		const [newGame] = await db
			.select()
			.from(games)
			.where(eq(games.id, data.newGameId));

		if (!newGame) {
			throw new Error(`Game with id ${data.newGameId} not found`);
		}
		if (newGame.status !== 'available') {
			throw new Error('Selected game is not available');
		}

		// 3. Get the latest checkout transaction for the return game to get attendee info
		const [lastCheckout] = await db
			.select()
			.from(transactions)
			.where(
				and(
					eq(transactions.gameId, data.returnGameId),
					eq(transactions.type, 'checkout')
				)
			)
			.orderBy(desc(transactions.createdAt))
			.limit(1);

		if (!lastCheckout) {
			throw new Error('No checkout transaction found for the return game');
		}

		const attendeeFirstName = lastCheckout.attendeeFirstName || '';
		const attendeeLastName = lastCheckout.attendeeLastName || '';
		const idType = lastCheckout.idType || '';

		// 4. Execute in a single db.transaction()
		const { checkinTransaction, checkoutTransaction } = await db.transaction(async (tx) => {
			// 4a. Update return game status to available, increment version
			const [updatedReturnGame] = await tx
				.update(games)
				.set({
					status: 'available',
					version: sql`${games.version} + 1`,
					updatedAt: new Date()
				})
				.where(eq(games.id, data.returnGameId))
				.returning();

			if (!updatedReturnGame) {
				throw new Error('Failed to update return game status');
			}

			// 4b. Create checkin transaction for return game
			const [checkinTx] = await tx
				.insert(transactions)
				.values({
					gameId: data.returnGameId,
					type: 'checkin',
					attendeeFirstName,
					attendeeLastName,
					idType,
					checkoutWeight: lastCheckout.checkoutWeight,
					checkinWeight: data.checkinWeight
				})
				.returning();

			// 4c. Update new game status to checked_out, increment version
			const [updatedNewGame] = await tx
				.update(games)
				.set({
					status: 'checked_out',
					version: sql`${games.version} + 1`,
					updatedAt: new Date()
				})
				.where(
					and(
						eq(games.id, data.newGameId),
						eq(games.status, 'available')
					)
				)
				.returning();

			if (!updatedNewGame) {
				throw new Error('Conflict: new game was modified by another user or is not available');
			}

			// 4d. Call attendeeService.upsert with the attendee info
			const attendeeId = await attendeeService.upsert({
				firstName: attendeeFirstName,
				lastName: attendeeLastName,
				idType
			});

			// 4e. Create checkout transaction for new game
			const [checkoutTx] = await tx
				.insert(transactions)
				.values({
					gameId: data.newGameId,
					type: 'checkout',
					attendeeFirstName,
					attendeeLastName,
					idType,
					attendeeId,
					checkoutWeight: data.checkoutWeight
				})
				.returning();

			return { checkinTransaction: checkinTx, checkoutTransaction: checkoutTx };
		});

		// 5. Compare weights (return game's original checkout weight vs provided checkinWeight)
		let weightWarning: WeightWarning | undefined;
		if (lastCheckout.checkoutWeight != null) {
			const [config] = await db
				.select({ weightTolerance: conventionConfig.weightTolerance })
				.from(conventionConfig)
				.where(eq(conventionConfig.id, 1));

			const tolerance = config?.weightTolerance ?? 0.5;
			const level = getWeightWarningLevel(lastCheckout.checkoutWeight, data.checkinWeight, tolerance);

			if (level !== 'none') {
				weightWarning = {
					checkoutWeight: lastCheckout.checkoutWeight,
					checkinWeight: data.checkinWeight,
					difference: Math.abs(data.checkinWeight - lastCheckout.checkoutWeight),
					tolerance,
					level
				};
			}
		}

		// 6. Broadcast WebSocket events for both games
		broadcastGameEvent('game_checked_in', data.returnGameId);
		broadcastTransactionEvent(checkinTransaction.id, data.returnGameId);
		broadcastGameEvent('game_checked_out', data.newGameId);
		broadcastTransactionEvent(checkoutTransaction.id, data.newGameId);

		// 7. Return both transactions and optional weight warning
		return { checkinTransaction, checkoutTransaction, weightWarning };
	},

	/**
	 * Reverse a checkout: change game status back to "available" and create a corrective checkin.
	 */
	async reverseCheckout(transactionId: number): Promise<{ gameId: number; correctionTransactionId: number }> {
		return await db.transaction(async (tx) => {
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
			const [correctionTx] = await tx.insert(transactions).values({
				gameId: originalTx.gameId,
				type: 'checkin',
				note: 'Error correction: checkout reversed',
				isCorrection: true,
				relatedTransactionId: transactionId
			}).returning();

			return { gameId: originalTx.gameId, correctionTransactionId: correctionTx.id };
		});
	},

	/**
	 * Reverse a checkin: change game status back to "checked_out" and create a corrective checkout.
	 */
	async reverseCheckin(transactionId: number): Promise<{ gameId: number; correctionTransactionId: number }> {
		return await db.transaction(async (tx) => {
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
			const [correctionTx] = await tx.insert(transactions).values({
				gameId: originalTx.gameId,
				type: 'checkout',
				note: 'Error correction: checkin reversed',
				isCorrection: true,
				relatedTransactionId: transactionId
			}).returning();

			return { gameId: originalTx.gameId, correctionTransactionId: correctionTx.id };
		});
	},

	/**
	 * List transactions with filters, pagination, and sorting.
	 * Returns results with game title.
	 */
	async list(
		filters: TransactionFilters = {},
		pagination: PaginationParams = { page: 1, pageSize: 20 },
		sort?: TransactionSortParams
	): Promise<PaginatedResult<TransactionWithGame>> {
		const conditions: SQL[] = [];

		if (filters.type) {
			conditions.push(eq(transactions.type, filters.type));
		}

		if (filters.attendeeName) {
			// Support full name search (e.g. "Beatrice Langford") by splitting on space
			const parts = filters.attendeeName.trim().split(/\s+/);
			if (parts.length >= 2) {
				const firstName = parts[0];
				const lastName = parts.slice(1).join(' ');
				conditions.push(
					sql`(${ilike(transactions.attendeeFirstName, `%${firstName}%`)} AND ${ilike(transactions.attendeeLastName, `%${lastName}%`)})`
				);
			} else {
				const search = `%${filters.attendeeName}%`;
				conditions.push(
					sql`(${ilike(transactions.attendeeFirstName, search)} OR ${ilike(transactions.attendeeLastName, search)})`
				);
			}
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

		// Build order clause
		let orderClause;
		if (sort) {
			const dir = sort.direction === 'desc' ? desc : asc;
			switch (sort.field) {
				case 'game_title':
					orderClause = [dir(games.title)];
					break;
				case 'type':
					orderClause = [dir(transactions.type)];
					break;
				case 'attendee':
					orderClause = [dir(transactions.attendeeLastName), dir(transactions.attendeeFirstName)];
					break;
				case 'created_at':
				default:
					orderClause = [dir(transactions.createdAt)];
					break;
			}
		} else {
			orderClause = [desc(transactions.createdAt)];
		}

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
			.orderBy(...orderClause)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	}
};
