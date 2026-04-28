import { db } from '../db/index.js';
import { games, transactions } from '../db/schema.js';
import { eq, and, sql, ilike, gte, lte, inArray, max, count, desc, asc, type SQL } from 'drizzle-orm';

// --- Types ---

export type GameStatus = 'available' | 'checked_out' | 'retired';
export type GameType = 'standard' | 'play_and_win' | 'play_and_take';

export interface GameRecord {
	id: number;
	title: string;
	bggId: number;
	copyNumber: number;
	status: string;
	gameType: string;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface GameFilters {
	status?: GameStatus;
	gameType?: GameType;
	titleSearch?: string;
	createdSince?: Date;
	lastCheckedOutBefore?: Date;
	lastTransactionStart?: Date;
	lastTransactionEnd?: Date;
}

export interface PaginationParams {
	page: number;
	pageSize: number;
}

export interface SortParams {
	field: 'title' | 'bgg_id' | 'status' | 'game_type' | 'last_transaction_date';
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

			return created;
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

		return updated;
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
			.select()
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

		// Count total
		const [{ total }] = await db
			.select({ total: count() })
			.from(games)
			.where(whereClause);

		// Sort by last_transaction_date requires a left join
		if (sort?.field === 'last_transaction_date') {
			const dir = sort.direction === 'desc' ? desc : asc;
			const lastTxDate = sql<Date>`MAX(${transactions.createdAt})`.as('last_tx_date');

			const items = await db
				.select({
					id: games.id,
					title: games.title,
					bggId: games.bggId,
					copyNumber: games.copyNumber,
					status: games.status,
					gameType: games.gameType,
					version: games.version,
					createdAt: games.createdAt,
					updatedAt: games.updatedAt
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

		// Standard sort
		const orderBy = buildSortExpression(sort);
		const items = await db
			.select()
			.from(games)
			.where(whereClause)
			.orderBy(...orderBy)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * List available games (excludes retired), with optional title search and pagination.
	 */
	async listAvailable(
		search?: string,
		pagination: PaginationParams = { page: 1, pageSize: 20 }
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

		const items = await db
			.select()
			.from(games)
			.where(whereClause)
			.orderBy(asc(games.title))
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * List checked-out games (excludes retired), with optional search by title or attendee name.
	 */
	async listCheckedOut(
		search?: string,
		pagination: PaginationParams = { page: 1, pageSize: 20 }
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

		const items = await db
			.select({
				id: games.id,
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				status: games.status,
				gameType: games.gameType,
				version: games.version,
				createdAt: games.createdAt,
				updatedAt: games.updatedAt,
				attendeeFirstName: latestCheckout.attendeeFirstName,
				attendeeLastName: latestCheckout.attendeeLastName,
				idType: latestCheckout.idType,
				checkoutWeight: latestCheckout.checkoutWeight,
				checkoutAt: latestCheckout.createdAt
			})
			.from(games)
			.innerJoin(latestCheckout, eq(games.id, latestCheckout.gameId))
			.where(whereClause)
			.orderBy(asc(games.title))
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * Toggle a game's status between "available" and "checked_out" with optimistic locking.
	 * Creates a corrective transaction in the transaction log.
	 */
	async toggleStatus(
		id: number,
		newStatus: 'available' | 'checked_out',
		version: number
	): Promise<GameRecord> {
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
			await tx.insert(transactions).values({
				gameId: id,
				type: txType,
				note: `Manual status override to "${newStatus}"`,
				isCorrection: true
			});

			return updated;
		});
	}
};
