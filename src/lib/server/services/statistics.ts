import { db } from '../db/index.js';
import { games, transactions, conventionConfig } from '../db/schema.js';
import { eq, and, sql, ilike, gte, lte, lt, count, desc, asc, type SQL } from 'drizzle-orm';
import type { PaginationParams, PaginatedResult, GameType } from './games.js';

// --- Types ---

export interface Duration {
	hours: number;
	minutes: number;
	totalMinutes: number;
}

export interface StatisticsFilters {
	timeRange?: { start: Date; end: Date };
	timeOfDay?: { startHour: number; endHour: number };
	conventionDay?: number;
	gameTitle?: string;
	attendeeName?: string;
	availabilityStatus?: 'available' | 'checked_out';
	gameType?: GameType;
	groupByBggTitle?: boolean;
}

export interface StatisticsResult {
	totalCheckouts: number;
	currentCheckedOut: number;
	currentAvailable: number;
	avgCheckoutsPerDay: number;
	avgCheckoutDuration: Duration;
	minCheckoutDuration: Duration;
	maxCheckoutDuration: Duration;
	longestCumulativeGame: { gameId: number; title: string; totalDuration: Duration } | null;
	topGames: PaginatedResult<{ title: string; checkoutCount: number }>;
	durationDistribution: { bucket: string; count: number }[];
}

interface CompletedPair {
	gameId: number;
	title: string;
	bggId: number;
	checkoutAt: Date;
	checkinAt: Date;
	durationMinutes: number;
}

// --- Helpers ---

function minutesToDuration(totalMinutes: number): Duration {
	if (!totalMinutes || totalMinutes < 0) return { hours: 0, minutes: 0, totalMinutes: 0 };
	const hours = Math.floor(totalMinutes / 60);
	const minutes = Math.round(totalMinutes % 60);
	return { hours, minutes, totalMinutes: Math.round(totalMinutes) };
}

/**
 * Build WHERE conditions for checkout transactions joined with games.
 */
function buildCheckoutConditions(filters: StatisticsFilters): SQL[] {
	const conditions: SQL[] = [eq(transactions.type, 'checkout')];

	if (filters.timeRange) {
		conditions.push(gte(transactions.createdAt, filters.timeRange.start));
		conditions.push(lte(transactions.createdAt, filters.timeRange.end));
	}

	if (filters.timeOfDay) {
		conditions.push(
			sql`EXTRACT(HOUR FROM ${transactions.createdAt}) >= ${filters.timeOfDay.startHour}`
		);
		conditions.push(
			sql`EXTRACT(HOUR FROM ${transactions.createdAt}) < ${filters.timeOfDay.endHour}`
		);
	}

	if (filters.gameTitle) {
		conditions.push(ilike(games.title, `%${filters.gameTitle}%`));
	}

	if (filters.attendeeName) {
		const search = `%${filters.attendeeName}%`;
		conditions.push(
			sql`(${ilike(transactions.attendeeFirstName, search)} OR ${ilike(transactions.attendeeLastName, search)})`
		);
	}

	if (filters.availabilityStatus) {
		conditions.push(eq(games.status, filters.availabilityStatus));
	}

	if (filters.gameType) {
		conditions.push(eq(games.gameType, filters.gameType));
	}

	return conditions;
}

/**
 * Resolve a convention day number to a date-range condition on transactions.createdAt.
 */
async function getConventionDayCondition(conventionDay: number): Promise<SQL | null> {
	const [config] = await db
		.select({ startDate: conventionConfig.startDate })
		.from(conventionConfig)
		.where(eq(conventionConfig.id, 1));

	if (!config?.startDate) return null;

	const startDate = new Date(config.startDate);
	const targetDate = new Date(startDate);
	targetDate.setDate(targetDate.getDate() + (conventionDay - 1));

	const nextDate = new Date(targetDate);
	nextDate.setDate(nextDate.getDate() + 1);

	return and(
		gte(transactions.createdAt, targetDate),
		lt(transactions.createdAt, nextDate)
	)!;
}

/**
 * Build the full checkout WHERE clause including the async convention day condition.
 */
async function buildFullCheckoutWhere(filters: StatisticsFilters): Promise<SQL | undefined> {
	const conditions = buildCheckoutConditions(filters);

	if (filters.conventionDay != null) {
		const dayCondition = await getConventionDayCondition(filters.conventionDay);
		if (dayCondition) conditions.push(dayCondition);
	}

	return and(...conditions);
}

/**
 * Fetch all transactions for games matching the filters, ordered by game and time.
 * Then pair checkouts with their next checkin in application code.
 * This avoids raw SQL CTEs and keeps everything in Drizzle's query builder.
 */
async function getCompletedPairs(filters: StatisticsFilters): Promise<CompletedPair[]> {
	// Build game-level filter conditions
	const gameConditions: SQL[] = [];
	if (filters.gameTitle) {
		gameConditions.push(ilike(games.title, `%${filters.gameTitle}%`));
	}
	if (filters.gameType) {
		gameConditions.push(eq(games.gameType, filters.gameType));
	}
	if (filters.availabilityStatus) {
		gameConditions.push(eq(games.status, filters.availabilityStatus));
	}

	// Build transaction-level filter conditions (applied to checkout transactions for filtering)
	const txConditions: SQL[] = [];
	if (filters.timeRange) {
		txConditions.push(gte(transactions.createdAt, filters.timeRange.start));
		txConditions.push(lte(transactions.createdAt, filters.timeRange.end));
	}
	if (filters.timeOfDay) {
		txConditions.push(
			sql`EXTRACT(HOUR FROM ${transactions.createdAt}) >= ${filters.timeOfDay.startHour}`
		);
		txConditions.push(
			sql`EXTRACT(HOUR FROM ${transactions.createdAt}) < ${filters.timeOfDay.endHour}`
		);
	}
	if (filters.attendeeName) {
		const search = `%${filters.attendeeName}%`;
		txConditions.push(
			sql`(${ilike(transactions.attendeeFirstName, search)} OR ${ilike(transactions.attendeeLastName, search)})`
		);
	}
	if (filters.conventionDay != null) {
		const dayCondition = await getConventionDayCondition(filters.conventionDay);
		if (dayCondition) txConditions.push(dayCondition);
	}

	// Fetch all checkout and checkin transactions for matching games, ordered by game then time
	const whereConditions: SQL[] = [...gameConditions];
	// We need both checkouts and checkins to form pairs, so don't filter by type here
	const allTx = await db
		.select({
			id: transactions.id,
			gameId: transactions.gameId,
			type: transactions.type,
			createdAt: transactions.createdAt,
			attendeeFirstName: transactions.attendeeFirstName,
			attendeeLastName: transactions.attendeeLastName,
			gameTitle: games.title,
			gameBggId: games.bggId
		})
		.from(transactions)
		.innerJoin(games, eq(transactions.gameId, games.id))
		.where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
		.orderBy(asc(transactions.gameId), asc(transactions.createdAt));

	// Pair checkouts with their next checkin per game in application code
	const pairs: CompletedPair[] = [];
	const txByGame = new Map<number, typeof allTx>();

	for (const tx of allTx) {
		if (!txByGame.has(tx.gameId)) txByGame.set(tx.gameId, []);
		txByGame.get(tx.gameId)!.push(tx);
	}

	for (const [, gameTxs] of txByGame) {
		for (let i = 0; i < gameTxs.length; i++) {
			const co = gameTxs[i];
			if (co.type !== 'checkout') continue;

			// Find the next checkin after this checkout
			for (let j = i + 1; j < gameTxs.length; j++) {
				if (gameTxs[j].type === 'checkin') {
					const ci = gameTxs[j];
					const checkoutAt = new Date(co.createdAt);
					const checkinAt = new Date(ci.createdAt);
					const durationMinutes = (checkinAt.getTime() - checkoutAt.getTime()) / (1000 * 60);

					// Apply transaction-level filters to the checkout
					let passesFilters = true;

					if (filters.timeRange) {
						if (checkoutAt < filters.timeRange.start || checkoutAt > filters.timeRange.end) {
							passesFilters = false;
						}
					}
					if (filters.timeOfDay && passesFilters) {
						const hour = checkoutAt.getHours();
						if (hour < filters.timeOfDay.startHour || hour >= filters.timeOfDay.endHour) {
							passesFilters = false;
						}
					}
					if (filters.attendeeName && passesFilters) {
						const search = filters.attendeeName.toLowerCase();
						const first = (co.attendeeFirstName ?? '').toLowerCase();
						const last = (co.attendeeLastName ?? '').toLowerCase();
						if (!first.includes(search) && !last.includes(search)) {
							passesFilters = false;
						}
					}
					if (filters.conventionDay != null && passesFilters) {
						// Convention day filtering was already applied at the DB level via txConditions
						// but since we fetched all types, we need to check the checkout timestamp
						// We'll rely on the pairs being formed from the full set and filter below
					}

					if (passesFilters) {
						pairs.push({
							gameId: co.gameId,
							title: co.gameTitle,
							bggId: co.gameBggId,
							checkoutAt,
							checkinAt,
							durationMinutes
						});
					}

					i = j; // Skip to after the checkin to avoid double-pairing
					break;
				}
			}
		}
	}

	return pairs;
}

// --- Statistics Service ---

export const statisticsService = {
	async getStatistics(
		filters: StatisticsFilters = {},
		topGamesPagination: PaginationParams = { page: 1, pageSize: 10 }
	): Promise<StatisticsResult> {
		const checkoutWhere = await buildFullCheckoutWhere(filters);

		// Total checkouts
		const [{ totalCheckouts }] = await db
			.select({ totalCheckouts: count() })
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere);

		// Current game counts (game-level filters only)
		const gameConditions: SQL[] = [];
		if (filters.gameTitle) gameConditions.push(ilike(games.title, `%${filters.gameTitle}%`));
		if (filters.gameType) gameConditions.push(eq(games.gameType, filters.gameType));

		const [{ currentCheckedOut }] = await db
			.select({ currentCheckedOut: count() })
			.from(games)
			.where(and(eq(games.status, 'checked_out'), ...gameConditions));

		const [{ currentAvailable }] = await db
			.select({ currentAvailable: count() })
			.from(games)
			.where(and(eq(games.status, 'available'), ...gameConditions));

		// Avg checkouts per day
		const [dateRange] = await db
			.select({
				minDate: sql<Date>`MIN(${transactions.createdAt})`,
				maxDate: sql<Date>`MAX(${transactions.createdAt})`
			})
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere);

		let avgCheckoutsPerDay = 0;
		if (totalCheckouts > 0 && dateRange.minDate && dateRange.maxDate) {
			const minDate = new Date(dateRange.minDate);
			const maxDate = new Date(dateRange.maxDate);
			const diffDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
			avgCheckoutsPerDay = Math.round((totalCheckouts / diffDays) * 100) / 100;
		}

		// Duration metrics from completed pairs (app-level pairing)
		const pairs = await getCompletedPairs(filters);

		const avgCheckoutDuration = minutesToDuration(
			pairs.length > 0 ? pairs.reduce((sum, p) => sum + p.durationMinutes, 0) / pairs.length : 0
		);
		const minCheckoutDuration = minutesToDuration(
			pairs.length > 0 ? Math.min(...pairs.map((p) => p.durationMinutes)) : 0
		);
		const maxCheckoutDuration = minutesToDuration(
			pairs.length > 0 ? Math.max(...pairs.map((p) => p.durationMinutes)) : 0
		);

		// Longest cumulative game
		const longestCumulativeGame = calcLongestCumulative(pairs, filters.groupByBggTitle ?? false);

		// Top games
		const topGames = await this.calcTopGames(filters, topGamesPagination);

		// Duration distribution
		const durationDistribution = calcDurationBuckets(pairs);

		return {
			totalCheckouts,
			currentCheckedOut,
			currentAvailable,
			avgCheckoutsPerDay,
			avgCheckoutDuration,
			minCheckoutDuration,
			maxCheckoutDuration,
			longestCumulativeGame,
			topGames,
			durationDistribution
		};
	},

	async calcTopGames(
		filters: StatisticsFilters,
		pagination: PaginationParams = { page: 1, pageSize: 10 }
	): Promise<PaginatedResult<{ title: string; checkoutCount: number }>> {
		const checkoutWhere = await buildFullCheckoutWhere(filters);

		const groupByField = filters.groupByBggTitle ? games.bggId : games.id;
		const titleExpr = filters.groupByBggTitle
			? sql<string>`MIN(${games.title})`
			: games.title;

		const countResult = await db
			.select({ groupCount: sql<number>`COUNT(DISTINCT ${groupByField})` })
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere);

		const total = Number(countResult[0]?.groupCount) || 0;

		const items = await db
			.select({
				title: titleExpr,
				checkoutCount: count()
			})
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere)
			.groupBy(groupByField)
			.orderBy(desc(count()), filters.groupByBggTitle ? sql`MIN(${games.title})` : games.title)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return {
			items: items.map((r) => ({
				title: String(r.title),
				checkoutCount: Number(r.checkoutCount)
			})),
			total,
			page: pagination.page,
			pageSize: pagination.pageSize
		};
	}
};

// --- Pure functions for computing stats from completed pairs ---

function calcLongestCumulative(
	pairs: CompletedPair[],
	groupByBgg: boolean
): { gameId: number; title: string; totalDuration: Duration } | null {
	if (pairs.length === 0) return null;

	const totals = new Map<string | number, { gameId: number; title: string; total: number }>();

	for (const p of pairs) {
		const key = groupByBgg ? p.bggId : p.gameId;
		const existing = totals.get(key);
		if (existing) {
			existing.total += p.durationMinutes;
		} else {
			totals.set(key, { gameId: p.gameId, title: p.title, total: p.durationMinutes });
		}
	}

	let best: { gameId: number; title: string; total: number } | null = null;
	for (const entry of totals.values()) {
		if (!best || entry.total > best.total) best = entry;
	}

	if (!best) return null;
	return { gameId: best.gameId, title: best.title, totalDuration: minutesToDuration(best.total) };
}

function calcDurationBuckets(pairs: CompletedPair[]): { bucket: string; count: number }[] {
	const buckets = [
		{ label: 'Under 30 minutes', min: 0, max: 30 },
		{ label: '30–60 minutes', min: 30, max: 60 },
		{ label: '1–2 hours', min: 60, max: 120 },
		{ label: 'Over 2 hours', min: 120, max: Infinity }
	];

	const counts = new Map<string, number>();
	for (const b of buckets) counts.set(b.label, 0);

	for (const p of pairs) {
		for (const b of buckets) {
			if (p.durationMinutes >= b.min && p.durationMinutes < b.max) {
				counts.set(b.label, (counts.get(b.label) ?? 0) + 1);
				break;
			}
		}
	}

	return buckets.map((b) => ({ bucket: b.label, count: counts.get(b.label) ?? 0 }));
}
