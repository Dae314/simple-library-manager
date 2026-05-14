import { db } from '../db/index.js';
import { attendees, transactions, games } from '../db/schema.js';
import { eq, and, sql, ilike, desc, asc, count, type SQL } from 'drizzle-orm';
import type { PaginationParams, PaginatedResult } from './games.js';

// --- Types ---

export interface AttendeeRecord {
	id: number;
	firstName: string;
	lastName: string;
	idType: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface AttendeeWithCount extends AttendeeRecord {
	transactionCount: number;
}

export interface AttendeeFilters {
	search?: string;
	idType?: string;
}

export interface AttendeeSortParams {
	field: 'first_name' | 'last_name' | 'id_type' | 'transaction_count';
	direction: 'asc' | 'desc';
}

// --- Attendee Service ---

export const attendeeService = {
	/**
	 * Upsert attendee by case-insensitive first+last name match.
	 * If attendee exists (matched case-insensitively after trimming), updates idType and updatedAt.
	 * If not, creates a new record.
	 * Returns the attendee ID.
	 */
	async upsert(data: { firstName: string; lastName: string; idType: string }): Promise<number> {
		const trimmedFirst = data.firstName.trim();
		const trimmedLast = data.lastName.trim();

		// Check if attendee exists (case-insensitive match on trimmed names)
		const [existing] = await db
			.select({ id: attendees.id })
			.from(attendees)
			.where(
				and(
					sql`LOWER(TRIM(${attendees.firstName})) = LOWER(${trimmedFirst})`,
					sql`LOWER(TRIM(${attendees.lastName})) = LOWER(${trimmedLast})`
				)
			)
			.limit(1);

		if (existing) {
			// Update idType and updatedAt
			await db
				.update(attendees)
				.set({
					idType: data.idType,
					updatedAt: new Date()
				})
				.where(eq(attendees.id, existing.id));

			return existing.id;
		}

		// Create new attendee
		const [created] = await db
			.insert(attendees)
			.values({
				firstName: trimmedFirst,
				lastName: trimmedLast,
				idType: data.idType
			})
			.returning({ id: attendees.id });

		return created.id;
	},

	/**
	 * Search attendees by prefix (for autofill).
	 * Case-insensitive prefix match on the specified field.
	 * Returns max 10 results. Requires minimum 2-character query.
	 */
	async searchByPrefix(query: string, field: 'firstName' | 'lastName'): Promise<AttendeeRecord[]> {
		if (query.length < 2) {
			return [];
		}

		const lowerQuery = query.toLowerCase();
		const column = field === 'firstName' ? attendees.firstName : attendees.lastName;

		const results = await db
			.select({
				id: attendees.id,
				firstName: attendees.firstName,
				lastName: attendees.lastName,
				idType: attendees.idType,
				createdAt: attendees.createdAt,
				updatedAt: attendees.updatedAt
			})
			.from(attendees)
			.where(sql`LOWER(${column}) LIKE ${lowerQuery + '%'}`)
			.orderBy(asc(column))
			.limit(10);

		return results;
	},

	/**
	 * List attendees with filters, pagination, and sorting.
	 * Joins with transactions to get checkout count per attendee.
	 */
	async list(
		filters: AttendeeFilters = {},
		pagination: PaginationParams = { page: 1, pageSize: 10 },
		sort?: AttendeeSortParams
	): Promise<PaginatedResult<AttendeeWithCount>> {
		const conditions: SQL[] = [];

		if (filters.search) {
			const search = `%${filters.search}%`;
			conditions.push(
				sql`(${ilike(attendees.firstName, search)} OR ${ilike(attendees.lastName, search)})`
			);
		}

		if (filters.idType) {
			conditions.push(eq(attendees.idType, filters.idType));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Count total matching records
		const [{ total }] = await db
			.select({ total: count() })
			.from(attendees)
			.where(whereClause);

		// Build sort expression
		const transactionCountExpr = sql<number>`COUNT(${transactions.id})`.mapWith(Number);

		let orderClause;
		if (sort) {
			const dir = sort.direction === 'desc' ? desc : asc;
			switch (sort.field) {
				case 'first_name':
					orderClause = [dir(attendees.firstName)];
					break;
				case 'last_name':
					orderClause = [dir(attendees.lastName)];
					break;
				case 'id_type':
					orderClause = [dir(attendees.idType)];
					break;
				case 'transaction_count':
					orderClause = [dir(transactionCountExpr)];
					break;
				default:
					orderClause = [asc(attendees.lastName)];
			}
		} else {
			orderClause = [asc(attendees.lastName)];
		}

		// Fetch paginated results with transaction count
		const items = await db
			.select({
				id: attendees.id,
				firstName: attendees.firstName,
				lastName: attendees.lastName,
				idType: attendees.idType,
				createdAt: attendees.createdAt,
				updatedAt: attendees.updatedAt,
				transactionCount: transactionCountExpr
			})
			.from(attendees)
			.leftJoin(transactions, eq(attendees.id, transactions.attendeeId))
			.where(whereClause)
			.groupBy(attendees.id)
			.orderBy(...orderClause)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return { items, total, page: pagination.page, pageSize: pagination.pageSize };
	},

	/**
	 * Get attendee by ID.
	 */
	async getById(id: number): Promise<AttendeeRecord | null> {
		const [attendee] = await db
			.select({
				id: attendees.id,
				firstName: attendees.firstName,
				lastName: attendees.lastName,
				idType: attendees.idType,
				createdAt: attendees.createdAt,
				updatedAt: attendees.updatedAt
			})
			.from(attendees)
			.where(eq(attendees.id, id));

		return attendee ?? null;
	},

	/**
	 * Update attendee fields. Validates uniqueness (case-insensitive name match excluding current ID).
	 * Throws if a duplicate name combination exists.
	 */
	async update(
		id: number,
		data: { firstName: string; lastName: string; idType: string }
	): Promise<AttendeeRecord> {
		const trimmedFirst = data.firstName.trim();
		const trimmedLast = data.lastName.trim();

		// Check uniqueness: another attendee with same name (case-insensitive) must not exist
		const [duplicate] = await db
			.select({ id: attendees.id })
			.from(attendees)
			.where(
				and(
					sql`LOWER(TRIM(${attendees.firstName})) = LOWER(${trimmedFirst})`,
					sql`LOWER(TRIM(${attendees.lastName})) = LOWER(${trimmedLast})`,
					sql`${attendees.id} != ${id}`
				)
			)
			.limit(1);

		if (duplicate) {
			throw new Error('An attendee with this name combination already exists');
		}

		const [updated] = await db
			.update(attendees)
			.set({
				firstName: trimmedFirst,
				lastName: trimmedLast,
				idType: data.idType,
				updatedAt: new Date()
			})
			.where(eq(attendees.id, id))
			.returning();

		if (!updated) {
			throw new Error(`Attendee with id ${id} not found`);
		}

		return updated;
	},

	/**
	 * Delete attendee. Rejects if attendee has active checkouts.
	 * Transactions are cascade-deleted via the FK relationship.
	 */
	async delete(id: number): Promise<void> {
		// Check for active checkouts
		const hasActive = await attendeeService.hasActiveCheckouts(id);
		if (hasActive) {
			throw new Error('Cannot delete attendee with active checkouts');
		}

		const [deleted] = await db
			.delete(attendees)
			.where(eq(attendees.id, id))
			.returning({ id: attendees.id });

		if (!deleted) {
			throw new Error(`Attendee with id ${id} not found`);
		}
	},

	/**
	 * Get transaction count for an attendee.
	 */
	async getTransactionCount(id: number): Promise<number> {
		const [result] = await db
			.select({ count: count() })
			.from(transactions)
			.where(eq(transactions.attendeeId, id));

		return result?.count ?? 0;
	},

	/**
	 * Check if attendee has active checkouts.
	 * An active checkout means a game is currently in 'checked_out' status
	 * and the most recent checkout transaction for that game is linked to this attendee.
	 */
	async hasActiveCheckouts(id: number): Promise<boolean> {
		// Find transactions for this attendee that are checkouts,
		// where the game is currently checked_out
		const [result] = await db
			.select({ count: count() })
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(
				and(
					eq(transactions.attendeeId, id),
					eq(transactions.type, 'checkout'),
					eq(games.status, 'checked_out')
				)
			);

		return (result?.count ?? 0) > 0;
	}
};
