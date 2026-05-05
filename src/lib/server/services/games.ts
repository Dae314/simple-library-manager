import { db } from '../db/index.js';
import { games, transactions } from '../db/schema.js';
import { eq, ne, and, sql, ilike, gte, lte, inArray, max, count, desc, asc, type SQL } from 'drizzle-orm';

/**
 * SQL expression that counts how many non-retired games share the same bgg_id.
 * Used as a window function to determine whether to display copy numbers.
 */
const totalCopiesExpr = sql<number>`COUNT(*) FILTER (WHERE ${games.status} != 'retired') OVER (PARTITION BY ${games.bggId})`.mapWith(Number);

// --- Types ---

export type GameStatus = 'available' | 'checked_out' | 'retired';
export type GameType = 'standard' | 'play_and_win' | 'play_and_take';

export interface GameRecord {
	id: number;
	title: string;
	bggId: number;
	copyNumber: number;
	totalCopies: number;
	status: string;
	gameType: string;
	version: number;
	createdAt: Date;
	updatedAt: Date;
	lastTransactionDate: Date | null;
}

export interface GameFilters {
	status?: GameStatus;
	excludeStatus?: GameStatus;
	gameType?: GameType;
	titleSearch?: string;
	createdSince?: Date;
	lastCheckedOutBefore?: Date;
	lastTransactionStart?: Date;
	lastTransactionEnd?: Date;
	groupByBgg?: boolean;
}

export interface PaginationParams {
	page: number;
	pageSize: number;
}

export interface SortParams {
	field: 'title' | 'bgg_id' | 'status' | 'game_type' | 'last_transaction_date' | 'created_at' | 'checkout_time' | 'attendee';
	direction: 'asc' | 'desc';
}

export interface LibraryGameRecord {
	id: number;
	title: string;
	bggId: number;
	copyNumber: number;
	totalCopies: number;
	status: string;
	gameType: string;
	version: number;
	attendeeFirstName: string | null;
	attendeeLastName: string | null;
	idType: string | null;
	checkoutWeight: number | null;
	checkoutAt: Date | null;
}

export interface LibraryFilters {
	status?: 'available' | 'checked_out';
	gameType?: GameType;
	titleSearch?: string;
	attendeeSearch?: string;
}

export interface LibrarySortParams {
	field: 'title' | 'game_type' | 'status' | 'bgg_id';
	direction: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
}

// --- Helpers ---

function buildGameWhereConditions(filters: GameFilters): SQL[] {
	const conditions: SQL[] = [];

	if (filters.status) {
		conditions.push(eq(games.status, filters.status));
	}
	if (filters.excludeStatus) {
		conditions.push(ne(games.status, filters.excludeStatus));
	}
	if (filters.gameType) {
		conditions.push(eq(games.gameType, filters.gameType));
	}
	if (filters.titleSearch) {
		conditions.push(ilike(games.title, `%${filters.titleSearch}%`));
	}
	if (filters.createdSince) {
		conditions.push(gte(games.createdAt, filters.createdSince));
	}

	return conditions;
}

function buildSortExpression(sort?: SortParams) {
	if (!sort) return [asc(games.title)];

	const dir = sort.direction === 'desc' ? desc : asc;

	switch (sort.field) {
		case 'title':
			return [dir(games.title)];
		case 'bgg_id':
			return [dir(games.bggId)];
		case 'status':
			return [dir(games.status)];
		case 'game_type':
			return [dir(games.gameType)];
		case 'created_at':
			return [dir(games.createdAt)];
		case 'last_transaction_date':
			// Handled separately in the list query with a subquery
			return [];
		default:
			return [asc(games.title)];
	}
}

// --- Game Service ---

export const gameService = {

	/**
	 * Create a new game. Copy number is auto-generated as MAX+1 per BGG_ID within a transaction.
	 */
	async create(data: {
		title: string;
		bggId: number;
		gameType?: GameType;
	}): Promise<GameRecord> {
		return await db.transaction(async (tx) => {
			// Get next copy number for this BGG_ID
			const [result] = await tx
				.select({ maxCopy: max(games.copyNumber) })
				.from(games)
				.where(eq(games.bggId, data.bggId));

			const nextCopyNumber = (result?.maxCopy ?? 0) + 1;

			const [created] = await tx
				.insert(games)
				.values({
					title: data.title.trim(),
					bggId: data.bggId,
					copyNumber: nextCopyNumber,
					status: 'available',
					gameType: data.gameType ?? 'standard'
				})
				.returning();

			// Count total non-retired copies for this bggId after insert
			const [copyCount] = await tx
				.select({ total: count() })
				.from(games)
				.where(and(eq(games.bggId, data.bggId), ne(games.status, 'retired')));

			return { ...created, totalCopies: copyCount?.total ?? 1, lastTransactionDate: null };
		});
	},

	/**
	 * Update an existing game's title, bggId, or gameType.
	 */
	async update(
		id: number,
		data: Partial<{ title: string; bggId: number; gameType: GameType }>
	): Promise<GameRecord> {
		const updateValues: Record<string, unknown> = { updatedAt: new Date() };

		if (data.title !== undefined) updateValues.title = data.title.trim();
		if (data.bggId !== undefined) updateValues.bggId = data.bggId;
		if (data.gameType !== undefined) updateValues.gameType = data.gameType;

		const [updated] = await db
			.update(games)
			.set(updateValues)
			.where(eq(games.id, id))
			.returning();

		if (!updated) {
			throw new Error(`Game with id ${id} not found`);
		}

		// Count total non-retired copies for this bggId
		const [copyCount] = await db
			.select({ total: count() })
			.from(games)
			.where(and(eq(games.bggId, updated.bggId), ne(games.status, 'retired')));

		// Get last transaction date
		const [lastTx] = await db
			.select({ lastDate: max(transactions.createdAt) })
			.from(transactions)
			.where(eq(transactions.gameId, id));

		return { ...updated, totalCopies: copyCount?.total ?? 1, lastTransactionDate: lastTx?.lastDate ?? null };
	},

	/**
	 * Retire one or more games (soft-delete).
	 */
	async retire(ids: number[]): Promise<void> {
		if (ids.length === 0) return;

		await db
			.update(games)
			.set({ status: 'retired', updatedAt: new Date() })
			.where(inArray(games.id, ids));
	},

	/**
	 * Restore a retired game back to "available".
	 */
	async restore(id: number): Promise<void> {
		const [updated] = await db
			.update(games)
			.set({ status: 'available', updatedAt: new Date() })
			.where(and(eq(games.id, id), eq(games.status, 'retired')))
			.returning();

		if (!updated) {
			throw new Error(`Game with id ${id} not found or is not retired`);
		}
	},

	/**
	 * Get a single game by ID.
	 */
	async getById(id: number): Promise<GameRecord | null> {
		const [game] = await db
			.select({
				id: games.id,
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				totalCopies: totalCopiesExpr,
				status: games.status,
				gameType: games.gameType,
				version: games.version,
				createdAt: games.createdAt,
				updatedAt: games.updatedAt,
				lastTransactionDate: sql<Date | null>`(SELECT MAX(${transactions.createdAt}) FROM ${transactions} WHERE ${transactions.gameId} = ${games.id})`
			})
			.from(games)
			.where(eq(games.id, id));

		return game ?? null;
	},

	/**
	 * List games with filters, pagination, and sorting.
	 * Supports date-based filters via subqueries on the transactions table.
	 */
	async list(
		filters: GameFilters = {},
		pagination: PaginationParams = { page: 1, pageSize: 20 },
		sort?: SortParams
	): Promise<PaginatedResult<GameRecord>> {
		const conditions = buildGameWhereConditions(filters);

		// Date-based filters that require subqueries on transactions
		if (filters.lastCheckedOutBefore) {
			const subquery = db
				.select({ gameId: transactions.gameId })
				.from(transactions)
				.where(
					and(
						eq(transactions.type, 'checkout'),
						lte(transactions.createdAt, filters.lastCheckedOutBefore)
					)
				)
				.groupBy(transactions.gameId)
				.having(
					sql`MAX(${transactions.createdAt}) <= ${filters.lastCheckedOutBefore}`
				);
			conditions.push(sql`${games.id} IN (${subquery})`);
		}

		if (filters.lastTransactionStart && filters.lastTransactionEnd) {
			const subquery = db
				.select({ gameId: transactions.gameId })
				.from(transactions)
				.groupBy(transactions.gameId)
				.having(
					and(
						sql`MAX(${transactions.createdAt}) >= ${filters.lastTransactionStart}`,
						sql`MAX(${transactions.createdAt}) <= ${filters.lastTransactionEnd}`
					)
				);
			conditions.push(sql`${games.id} IN (${subquery})`);
		} else if (filters.lastTransactionStart) {
			const subquery = db
				.select({ gameId: transactions.gameId })
				.from(transactions)
				.groupBy(transactions.gameId)
				.having(
					sql`MAX(${transactions.createdAt}) >= ${filters.lastTransactionStart}`
				);
			conditions.push(sql`${games.id} IN (${subquery})`);
		} else if (filters.lastTransactionEnd) {
			const subquery = db
				.select({ gameId: transactions.gameId })
				.from(transactions)
				.groupBy(transactions.gameId)
				.having(
					sql`MAX(${transactions.createdAt}) <= ${filters.lastTransactionEnd}`
				);
			conditions.push(sql`${games.id} IN (${subquery})`);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Grouped by BGG title mode
		if (filters.groupByBgg) {
			const [{ total }] = await db
				.select({ total: sql<number>`COUNT(DISTINCT ${games.bggId})` })
				.from(games)
				.where(whereClause);

			const groupedTotal = Number(total) || 0;

			const dir = sort?.direction === 'desc' ? desc : asc;
			let orderExpr;
			switch (sort?.field) {
				case 'bgg_id':
					orderExpr = dir(games.bggId);
					break;
				case 'status':
					orderExpr = dir(sql`MIN(${games.status})`);
					break;
				case 'game_type':
					orderExpr = dir(sql`MIN(${games.gameType})`);
					break;
				case 'last_transaction_date':
					orderExpr = dir(sql`MAX(${transactions.createdAt})`);
					break;
				default:
					orderExpr = dir(sql`MIN(${games.title})`);
			}

			const items = await db
				.select({
					id: sql<number>`MIN(${games.id})`.mapWith(Number),
					title: sql<string>`MIN(${games.title})`,
					bggId: games.bggId,
					copyNumber: sql<number>`1`.mapWith(Number),
					totalCopies: count(),
					status: sql<string>`MIN(${games.status})`,
					gameType: sql<string>`MIN(${games.gameType})`,
					version: sql<number>`MIN(${games.version})`.mapWith(Number),
					createdAt: sql<Date>`MIN(${games.createdAt})`,
					updatedAt: sql<Date>`MAX(${games.updatedAt})`,
					lastTransactionDate: sql<Date | null>`MAX(${transactions.createdAt})`
				})
				.from(games)
				.leftJoin(transactions, eq(games.id, transactions.gameId))
				.where(whereClause)
				.groupBy(games.bggId)
				.orderBy(orderExpr)
				.limit(pagination.pageSize)
				.offset((pagination.page - 1) * pagination.pageSize);

			return { items, total: groupedTotal, page: pagination.page, pageSize: pagination.pageSize };
		}

		// Count total
		const [{ total }] = await db
			.select({ total: count() })
			.from(games)
			.where(whereClause);

		// All queries now use a left join on transactions to get lastTransactionDate
		const lastTxDate = sql<Date | null>`MAX(${transactions.createdAt})`;

		if (sort?.field === 'last_transaction_date') {
			const dir = sort.direction === 'desc' ? desc : asc;

			const items = await db
				.select({
					id: games.id,
					title: games.title,
					bggId: games.bggId,
					copyNumber: games.copyNumber,
					totalCopies: totalCopiesExpr,
					status: games.status,
					gameType: games.gameType,
					version: games.version,
					createdAt: games.createdAt,
					updatedAt: games.updatedAt,
					lastTransactionDate: lastTxDate
				})
				.from(games)
				.leftJoin(transactions, eq(games.id, transactions.gameId))
				.where(whereClause)
				.groupBy(games.id)
				.orderBy(dir(lastTxDate))
				.limit(pagination.pageSize)
				.offset((pagination.page - 1) * pagination.pageSize);

			return { items, total, page: pagination.page, pageSize: pagination.pageSize };
		}

		// Standard sort — still join transactions to get lastTransactionDate
		const orderBy = buildSortExpression(sort);
		const items = await db
			.select({
				id: games.id,
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				totalCopies: totalCopiesExpr,
				status: games.status,
				gameType: games.gameType,
				version: games.version,
				createdAt: games.createdAt,
				updatedAt: games.updatedAt,
				lastTransactionDate: lastTxDate
			})
			.from(games)
			.leftJoin(transactions, eq(games.id, transactions.gameId))
			.where(whereClause)
			.groupBy(games.id)
			.orderBy(...orderBy)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * List available games (excludes retired), with optional title search, pagination, and sorting.
	 */
	async listAvailable(
		search?: string,
		pagination: PaginationParams = { page: 1, pageSize: 20 },
		sort?: SortParams
	): Promise<PaginatedResult<GameRecord>> {
		const conditions: SQL[] = [eq(games.status, 'available')];
		if (search) {
			conditions.push(ilike(games.title, `%${search}%`));
		}

		const whereClause = and(...conditions);

		const [{ total }] = await db
			.select({ total: count() })
			.from(games)
			.where(whereClause);

		const orderBy = buildSortExpression(sort);
		const items = await db
			.select({
				id: games.id,
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				totalCopies: totalCopiesExpr,
				status: games.status,
				gameType: games.gameType,
				version: games.version,
				createdAt: games.createdAt,
				updatedAt: games.updatedAt,
				lastTransactionDate: sql<Date | null>`(SELECT MAX(t."created_at") FROM "transactions" t WHERE t."game_id" = ${games.id})`
			})
			.from(games)
			.where(whereClause)
			.orderBy(...orderBy)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * List checked-out games (excludes retired), with optional search by title or attendee name.
	 */
	async listCheckedOut(
		search?: string,
		pagination: PaginationParams = { page: 1, pageSize: 20 },
		sort?: SortParams
	): Promise<PaginatedResult<GameRecord & { attendeeFirstName?: string | null; attendeeLastName?: string | null; idType?: string | null; checkoutWeight?: number | null; checkoutAt?: Date | null }>> {
		const conditions: SQL[] = [eq(games.status, 'checked_out')];

		// Subquery to get the latest checkout transaction per game
		const latestCheckout = db
			.select({
				gameId: transactions.gameId,
				attendeeFirstName: transactions.attendeeFirstName,
				attendeeLastName: transactions.attendeeLastName,
				idType: transactions.idType,
				checkoutWeight: transactions.checkoutWeight,
				createdAt: transactions.createdAt,
				rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${transactions.gameId} ORDER BY ${transactions.createdAt} DESC)`.as('rn')
			})
			.from(transactions)
			.where(eq(transactions.type, 'checkout'))
			.as('latest_checkout');

		if (search) {
			conditions.push(
				sql`(${ilike(games.title, `%${search}%`)} OR ${ilike(latestCheckout.attendeeFirstName, `%${search}%`)} OR ${ilike(latestCheckout.attendeeLastName, `%${search}%`)})`
			);
		}

		const whereClause = and(...conditions, eq(latestCheckout.rn, 1));

		const countResult = await db
			.select({ total: count() })
			.from(games)
			.innerJoin(latestCheckout, eq(games.id, latestCheckout.gameId))
			.where(whereClause);

		const total = countResult[0]?.total ?? 0;

		// Build order clause based on sort params
		let orderClause;
		if (sort) {
			const dir = sort.direction === 'desc' ? desc : asc;
			switch (sort.field) {
				case 'checkout_time':
					orderClause = [dir(latestCheckout.createdAt)];
					break;
				case 'attendee':
					orderClause = [dir(latestCheckout.attendeeLastName), dir(latestCheckout.attendeeFirstName)];
					break;
				case 'title':
					orderClause = [dir(games.title)];
					break;
				case 'game_type':
					orderClause = [dir(games.gameType)];
					break;
				default:
					orderClause = [asc(games.title)];
			}
		} else {
			orderClause = [asc(games.title)];
		}

		const items = await db
			.select({
				id: games.id,
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				totalCopies: totalCopiesExpr,
				status: games.status,
				gameType: games.gameType,
				version: games.version,
				createdAt: games.createdAt,
				updatedAt: games.updatedAt,
				lastTransactionDate: latestCheckout.createdAt,
				attendeeFirstName: latestCheckout.attendeeFirstName,
				attendeeLastName: latestCheckout.attendeeLastName,
				idType: latestCheckout.idType,
				checkoutWeight: latestCheckout.checkoutWeight,
				checkoutAt: latestCheckout.createdAt
			})
			.from(games)
			.innerJoin(latestCheckout, eq(games.id, latestCheckout.gameId))
			.where(whereClause)
			.orderBy(...orderClause)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * List all non-retired games with optional checkout info from the latest checkout transaction.
	 * Available games have null attendee/checkout fields. Supports filtering by status, game type,
	 * title search, and attendee name search, plus sorting and pagination.
	 */
	async listLibrary(
		filters: LibraryFilters = {},
		pagination: PaginationParams = { page: 1, pageSize: 20 },
		sort?: LibrarySortParams
	): Promise<PaginatedResult<LibraryGameRecord>> {
		// Subquery to get the latest checkout transaction per game (ROW_NUMBER window)
		const latestCheckout = db
			.select({
				gameId: transactions.gameId,
				attendeeFirstName: transactions.attendeeFirstName,
				attendeeLastName: transactions.attendeeLastName,
				idType: transactions.idType,
				checkoutWeight: transactions.checkoutWeight,
				createdAt: transactions.createdAt,
				rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${transactions.gameId} ORDER BY ${transactions.createdAt} DESC)`.as('rn')
			})
			.from(transactions)
			.where(eq(transactions.type, 'checkout'))
			.as('latest_checkout');

		// Build WHERE conditions
		const conditions: SQL[] = [ne(games.status, 'retired')];

		if (filters.status) {
			conditions.push(eq(games.status, filters.status));
		}
		if (filters.gameType) {
			conditions.push(eq(games.gameType, filters.gameType));
		}
		if (filters.titleSearch) {
			conditions.push(ilike(games.title, `%${filters.titleSearch}%`));
		}
		if (filters.attendeeSearch) {
			conditions.push(
				sql`(${ilike(latestCheckout.attendeeFirstName, `%${filters.attendeeSearch}%`)} OR ${ilike(latestCheckout.attendeeLastName, `%${filters.attendeeSearch}%`)})`
			);
		}

		// The LEFT JOIN condition: match on game_id AND rn = 1 (latest checkout only)
		const joinCondition = and(
			eq(games.id, latestCheckout.gameId),
			eq(latestCheckout.rn, 1)
		);

		const whereClause = and(...conditions);

		// Count total matching records
		const countResult = await db
			.select({ total: count() })
			.from(games)
			.leftJoin(latestCheckout, joinCondition)
			.where(whereClause);

		const total = countResult[0]?.total ?? 0;

		// Build sort expression
		let orderClause;
		if (sort) {
			const dir = sort.direction === 'desc' ? desc : asc;
			switch (sort.field) {
				case 'title':
					orderClause = [dir(games.title)];
					break;
				case 'game_type':
					orderClause = [dir(games.gameType)];
					break;
				case 'status':
					orderClause = [dir(games.status)];
					break;
				case 'bgg_id':
					orderClause = [dir(games.bggId)];
					break;
				default:
					orderClause = [asc(games.title)];
			}
		} else {
			orderClause = [asc(games.title)];
		}

		const items = await db
			.select({
				id: games.id,
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				totalCopies: totalCopiesExpr,
				status: games.status,
				gameType: games.gameType,
				version: games.version,
				attendeeFirstName: latestCheckout.attendeeFirstName,
				attendeeLastName: latestCheckout.attendeeLastName,
				idType: latestCheckout.idType,
				checkoutWeight: latestCheckout.checkoutWeight,
				checkoutAt: latestCheckout.createdAt
			})
			.from(games)
			.leftJoin(latestCheckout, joinCondition)
			.where(whereClause)
			.orderBy(...orderClause)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * Get the last recorded weight for each of the given game IDs.
	 * Looks at the most recent non-correction transaction that has a weight value
	 * (checkin_weight preferred, falls back to checkout_weight).
	 * Returns a map of gameId → weight.
	 */
	async getLastWeights(gameIds: number[]): Promise<Record<number, number>> {
		if (gameIds.length === 0) return {};

		const rows = await db
			.select({
				gameId: transactions.gameId,
				checkoutWeight: transactions.checkoutWeight,
				checkinWeight: transactions.checkinWeight
			})
			.from(transactions)
			.where(
				and(
					inArray(transactions.gameId, gameIds),
					eq(transactions.isCorrection, false),
					sql`(${transactions.checkinWeight} IS NOT NULL OR ${transactions.checkoutWeight} IS NOT NULL)`
				)
			)
			.orderBy(desc(transactions.createdAt));

		// Pick the first (most recent) weight per game
		const result: Record<number, number> = {};
		for (const row of rows) {
			if (result[row.gameId] !== undefined) continue;
			const weight = row.checkinWeight ?? row.checkoutWeight;
			if (weight != null) {
				result[row.gameId] = weight;
			}
		}

		return result;
	},

	/**
	 * Get the count of transactions associated with a game.
	 * Returns 0 if the game has no transactions.
	 */
	async getTransactionCount(gameId: number): Promise<number> {
		const [result] = await db
			.select({ count: count() })
			.from(transactions)
			.where(eq(transactions.gameId, gameId));
		return result?.count ?? 0;
	},

	/**
	 * Permanently delete a game and all its associated transactions.
	 * The game must not be checked out. All operations run in a single
	 * database transaction for atomicity.
	 */
	async delete(id: number): Promise<void> {
		await db.transaction(async (tx) => {
			const [game] = await tx
				.select({ id: games.id, status: games.status })
				.from(games)
				.where(eq(games.id, id));

			if (!game) {
				throw new Error('Game not found');
			}

			if (game.status === 'checked_out') {
				throw new Error('Cannot delete a checked-out game');
			}

			await tx.delete(transactions).where(eq(transactions.gameId, id));
			await tx.delete(games).where(eq(games.id, id));
		});
	},

	/**
	 * Toggle a game's status between "available" and "checked_out" with optimistic locking.
	 * Creates a corrective transaction in the transaction log.
	 */
	async toggleStatus(
		id: number,
		newStatus: 'available' | 'checked_out',
		version: number
	): Promise<GameRecord & { transactionId: number }> {
		return await db.transaction(async (tx) => {
			// Optimistic locking: update only if version matches
			const [updated] = await tx
				.update(games)
				.set({
					status: newStatus,
					version: sql`${games.version} + 1`,
					updatedAt: new Date()
				})
				.where(
					and(
						eq(games.id, id),
						eq(games.version, version)
					)
				)
				.returning();

			if (!updated) {
				throw new Error('Conflict: game was modified by another user');
			}

			// Create corrective transaction
			const txType = newStatus === 'available' ? 'checkin' : 'checkout';
			const [correctionTx] = await tx.insert(transactions).values({
				gameId: id,
				type: txType,
				note: `Manual status override to "${newStatus}"`,
				isCorrection: true
			}).returning();

			// Count total non-retired copies for this bggId
			const [copyCount] = await tx
				.select({ total: count() })
				.from(games)
				.where(and(eq(games.bggId, updated.bggId), ne(games.status, 'retired')));

			return { ...updated, totalCopies: copyCount?.total ?? 1, lastTransactionDate: correctionTx.createdAt, transactionId: correctionTx.id };
		});
	}
};
