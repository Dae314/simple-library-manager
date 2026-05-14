import { db } from '../db/index.js';
import { games, transactions, conventionConfig, attendees } from '../db/schema.js';
import { eq, and, sql, ilike, gte, lte, lt, count, desc, asc, type SQL } from 'drizzle-orm';
import type { PaginationParams, PaginatedResult, PrizeType } from './games.js';

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
	gameType?: PrizeType;
	groupByBggTitle?: boolean;
}

export type TimeGranularity = 'hourly' | 'block' | 'daily';

export interface TimeDistributionBucket {
	label: string;
	count: number;
}

export interface TimeDistribution {
	granularity: TimeGranularity;
	buckets: TimeDistributionBucket[];
}

export interface TopGameItem {
	title: string;
	prizeType: string;
	status: string;
	checkoutCount: number;
}

export interface TopAttendeeItem {
	firstName: string;
	lastName: string;
	checkoutCount: number;
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
	topGames: PaginatedResult<TopGameItem>;
	durationDistribution: { bucket: string; count: number }[];
	timeDistribution: TimeDistribution;
}

export type TopGamesSortField = 'title' | 'game_type' | 'status' | 'checkouts';
export type SortDirection = 'asc' | 'desc';

export interface TopGamesSortParams {
	field: TopGamesSortField;
	direction: SortDirection;
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
 * Parse a PostgreSQL date string (YYYY-MM-DD) as a local-time Date.
 * Avoids the UTC-midnight pitfall of `new Date('2025-05-01')`.
 */
function parseLocalDate(dateStr: string): Date {
	const parts = dateStr.split('-').map(Number);
	return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Build WHERE conditions for checkout transactions joined with games.
 * With timestamptz, direct Date comparisons work correctly — the pg driver
 * sends Dates as UTC and PostgreSQL compares UTC values.
 */
function buildCheckoutConditions(filters: StatisticsFilters): SQL[] {
	const conditions: SQL[] = [eq(transactions.type, 'checkout')];

	if (filters.timeRange) {
		conditions.push(gte(transactions.createdAt, filters.timeRange.start));
		conditions.push(lte(transactions.createdAt, filters.timeRange.end));
	}

	if (filters.timeOfDay) {
		// With session timezone set, EXTRACT returns local hours
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
		conditions.push(eq(games.prizeType, filters.gameType));
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

	const targetDate = parseLocalDate(config.startDate);
	targetDate.setDate(targetDate.getDate() + (conventionDay - 1));
	targetDate.setHours(0, 0, 0, 0);

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
 */
async function getCompletedPairs(filters: StatisticsFilters): Promise<CompletedPair[]> {
	const gameConditions: SQL[] = [];
	if (filters.gameTitle) {
		gameConditions.push(ilike(games.title, `%${filters.gameTitle}%`));
	}
	if (filters.gameType) {
		gameConditions.push(eq(games.prizeType, filters.gameType));
	}
	if (filters.availabilityStatus) {
		gameConditions.push(eq(games.status, filters.availabilityStatus));
	}

	// Resolve convention day to a concrete date range for app-level filtering
	let conventionDayRange: { start: Date; end: Date } | null = null;
	if (filters.conventionDay != null) {
		const [config] = await db
			.select({ startDate: conventionConfig.startDate })
			.from(conventionConfig)
			.where(eq(conventionConfig.id, 1));

		if (config?.startDate) {
			const start = parseLocalDate(config.startDate);
			start.setDate(start.getDate() + (filters.conventionDay - 1));
			start.setHours(0, 0, 0, 0);
			const end = new Date(start);
			end.setHours(23, 59, 59, 999);
			conventionDayRange = { start, end };
		}
	}

	const whereConditions: SQL[] = [...gameConditions];
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

			for (let j = i + 1; j < gameTxs.length; j++) {
				if (gameTxs[j].type === 'checkin') {
					const ci = gameTxs[j];
					const checkoutAt = new Date(co.createdAt);
					const checkinAt = new Date(ci.createdAt);
					const durationMinutes = (checkinAt.getTime() - checkoutAt.getTime()) / (1000 * 60);

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
					if (conventionDayRange && passesFilters) {
						if (checkoutAt < conventionDayRange.start || checkoutAt > conventionDayRange.end) {
							passesFilters = false;
						}
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

					i = j;
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
		topGamesPagination: PaginationParams = { page: 1, pageSize: 10 },
		topGamesSort?: TopGamesSortParams
	): Promise<StatisticsResult> {
		const checkoutWhere = await buildFullCheckoutWhere(filters);

		const [{ totalCheckouts }] = await db
			.select({ totalCheckouts: count() })
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere);

		const gameConditions: SQL[] = [];
		if (filters.gameTitle) gameConditions.push(ilike(games.title, `%${filters.gameTitle}%`));
		if (filters.gameType) gameConditions.push(eq(games.prizeType, filters.gameType));

		const [{ currentCheckedOut }] = await db
			.select({ currentCheckedOut: count() })
			.from(games)
			.where(and(eq(games.status, 'checked_out'), ...gameConditions));

		const [{ currentAvailable }] = await db
			.select({ currentAvailable: count() })
			.from(games)
			.where(and(eq(games.status, 'available'), ...gameConditions));

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

		const longestCumulativeGame = calcLongestCumulative(pairs, filters.groupByBggTitle ?? false);
		const topGames = await this.calcTopGames(filters, topGamesPagination, topGamesSort);
		const durationDistribution = calcDurationBuckets(pairs);
		const timeDistribution = await calcTimeDistribution(checkoutWhere, filters);

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
			durationDistribution,
			timeDistribution
		};
	},

	async calcTopGames(
		filters: StatisticsFilters,
		pagination: PaginationParams = { page: 1, pageSize: 10 },
		sort?: TopGamesSortParams
	): Promise<PaginatedResult<TopGameItem>> {
		const checkoutWhere = await buildFullCheckoutWhere(filters);

		const groupByField = filters.groupByBggTitle ? games.bggId : games.id;
		const titleExpr = filters.groupByBggTitle
			? sql<string>`MIN(${games.title})`
			: games.title;
		const prizeTypeExpr = filters.groupByBggTitle
			? sql<string>`MIN(${games.prizeType})`
			: games.prizeType;
		const statusExpr = filters.groupByBggTitle
			? sql<string>`MIN(${games.status})`
			: games.status;

		const countResult = await db
			.select({ groupCount: sql<number>`COUNT(DISTINCT ${groupByField})` })
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere);

		const total = Number(countResult[0]?.groupCount) || 0;

		// Determine sort order
		let orderByClause;
		if (sort) {
			const dir = sort.direction === 'asc' ? asc : desc;
			switch (sort.field) {
				case 'title':
					orderByClause = filters.groupByBggTitle
						? [dir(sql`MIN(${games.title})`)]
						: [dir(games.title)];
					break;
				case 'game_type':
					orderByClause = filters.groupByBggTitle
						? [dir(sql`MIN(${games.prizeType})`), desc(count())]
						: [dir(games.prizeType), desc(count())];
					break;
				case 'status':
					orderByClause = filters.groupByBggTitle
						? [dir(sql`MIN(${games.status})`), desc(count())]
						: [dir(games.status), desc(count())];
					break;
				case 'checkouts':
				default:
					orderByClause = [dir(count()), filters.groupByBggTitle ? asc(sql`MIN(${games.title})`) : asc(games.title)];
					break;
			}
		} else {
			orderByClause = [desc(count()), filters.groupByBggTitle ? asc(sql`MIN(${games.title})`) : asc(games.title)];
		}

		const items = await db
			.select({
				title: titleExpr,
				prizeType: prizeTypeExpr,
				status: statusExpr,
				checkoutCount: count()
			})
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere)
			.groupBy(groupByField)
			.orderBy(...orderByClause)
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		return {
			items: items.map((r) => ({
				title: String(r.title),
				prizeType: String(r.prizeType),
				status: String(r.status),
				checkoutCount: Number(r.checkoutCount)
			})),
			total,
			page: pagination.page,
			pageSize: pagination.pageSize
		};
	},

	async getTopAttendees(
		filters: StatisticsFilters,
		limit: number = 10
	): Promise<TopAttendeeItem[]> {
		// Build conditions: type='checkout' AND isCorrection=false, plus same filters
		const conditions: SQL[] = [
			eq(transactions.type, 'checkout'),
			eq(transactions.isCorrection, false)
		];

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
			conditions.push(eq(games.prizeType, filters.gameType));
		}

		if (filters.conventionDay != null) {
			const dayCondition = await getConventionDayCondition(filters.conventionDay);
			if (dayCondition) conditions.push(dayCondition);
		}

		const where = and(...conditions);

		const results = await db
			.select({
				firstName: attendees.firstName,
				lastName: attendees.lastName,
				checkoutCount: count()
			})
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.innerJoin(attendees, eq(transactions.attendeeId, attendees.id))
			.where(where)
			.groupBy(attendees.id, attendees.firstName, attendees.lastName)
			.orderBy(desc(count()), asc(attendees.lastName), asc(attendees.firstName))
			.limit(limit);

		return results.map((r) => ({
			firstName: r.firstName,
			lastName: r.lastName,
			checkoutCount: Number(r.checkoutCount)
		}));
	}
};

// --- Pure functions ---

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

/**
 * Determine the appropriate time granularity based on the date range span.
 * - 1 calendar day: hourly (24 buckets)
 * - 2–7 calendar days: 6-hour blocks per day
 * - 8+ calendar days: daily totals
 */
export function determineGranularity(rangeStart: Date | null, rangeEnd: Date | null): TimeGranularity {
	if (!rangeStart || !rangeEnd) return 'daily';
	if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) return 'daily';

	const startDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
	const endDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
	const calendarDays = Math.round((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

	if (calendarDays <= 1) return 'hourly';
	if (calendarDays <= 7) return 'block';
	return 'daily';
}

async function calcTimeDistribution(
	checkoutWhere: SQL | undefined,
	filters: StatisticsFilters
): Promise<TimeDistribution> {
	let rangeStart: Date | null = filters.timeRange?.start ?? null;
	let rangeEnd: Date | null = filters.timeRange?.end ?? null;

	// Convention day → single-day range
	if (filters.conventionDay != null) {
		const [config] = await db
			.select({ startDate: conventionConfig.startDate })
			.from(conventionConfig)
			.where(eq(conventionConfig.id, 1));

		if (config?.startDate) {
			const start = parseLocalDate(config.startDate);
			start.setDate(start.getDate() + (filters.conventionDay - 1));
			start.setHours(0, 0, 0, 0);
			rangeStart = start;
			rangeEnd = new Date(start);
			rangeEnd.setHours(23, 59, 59, 999);
		}
	}

	// No range → use convention dates or data span
	if (!rangeStart || !rangeEnd) {
		const [config] = await db
			.select({ startDate: conventionConfig.startDate, endDate: conventionConfig.endDate })
			.from(conventionConfig)
			.where(eq(conventionConfig.id, 1));

		if (config?.startDate && config?.endDate) {
			rangeStart = parseLocalDate(config.startDate);
			rangeStart.setHours(0, 0, 0, 0);
			rangeEnd = parseLocalDate(config.endDate);
			rangeEnd.setHours(23, 59, 59, 999);
		} else {
			const [span] = await db
				.select({
					minDate: sql<Date>`MIN(${transactions.createdAt})`,
					maxDate: sql<Date>`MAX(${transactions.createdAt})`
				})
				.from(transactions)
				.innerJoin(games, eq(transactions.gameId, games.id))
				.where(checkoutWhere);

			if (span?.minDate && span?.maxDate) {
				rangeStart = new Date(span.minDate);
				rangeEnd = new Date(span.maxDate);
				rangeStart.setHours(0, 0, 0, 0);
				rangeEnd.setHours(23, 59, 59, 999);
			}
		}
	}

	const granularity = determineGranularity(rangeStart, rangeEnd);

	if (granularity === 'hourly') {
		const rows = await db
			.select({
				hour: sql<number>`EXTRACT(HOUR FROM ${transactions.createdAt})::int`,
				count: count()
			})
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere)
			.groupBy(sql`EXTRACT(HOUR FROM ${transactions.createdAt})::int`)
			.orderBy(sql`EXTRACT(HOUR FROM ${transactions.createdAt})::int`);

		const hourMap = new Map<number, number>();
		for (const row of rows) {
			hourMap.set(Number(row.hour), Number(row.count));
		}

		const buckets: TimeDistributionBucket[] = [];
		for (let h = 0; h < 24; h++) {
			const period = h < 12 ? 'AM' : 'PM';
			const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
			buckets.push({ label: `${display}${period}`, count: hourMap.get(h) ?? 0 });
		}

		return { granularity, buckets };
	}

	if (granularity === 'block') {
		const rows = await db
			.select({
				date: sql<string>`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`,
				block: sql<number>`FLOOR(EXTRACT(HOUR FROM ${transactions.createdAt}) / 6)::int`,
				count: count()
			})
			.from(transactions)
			.innerJoin(games, eq(transactions.gameId, games.id))
			.where(checkoutWhere)
			.groupBy(
				sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`,
				sql`FLOOR(EXTRACT(HOUR FROM ${transactions.createdAt}) / 6)::int`
			)
			.orderBy(
				sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`,
				sql`FLOOR(EXTRACT(HOUR FROM ${transactions.createdAt}) / 6)::int`
			);

		const blockLabels = ['Night', 'Morning', 'Afternoon', 'Evening'];
		const dataMap = new Map<string, number>();
		for (const row of rows) {
			dataMap.set(`${row.date}-${row.block}`, Number(row.count));
		}

		const buckets: TimeDistributionBucket[] = [];
		if (rangeStart && rangeEnd) {
			const current = new Date(rangeStart);
			current.setHours(0, 0, 0, 0);
			while (current <= rangeEnd) {
				const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
				const dayName = current.toLocaleDateString('en-US', { weekday: 'short' });
				for (let block = 0; block < 4; block++) {
					buckets.push({
						label: `${dayName} ${blockLabels[block]}`,
						count: dataMap.get(`${dateStr}-${block}`) ?? 0
					});
				}
				current.setDate(current.getDate() + 1);
			}
		}

		return { granularity, buckets };
	}

	// Daily
	const rows = await db
		.select({
			date: sql<string>`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`,
			count: count()
		})
		.from(transactions)
		.innerJoin(games, eq(transactions.gameId, games.id))
		.where(checkoutWhere)
		.groupBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`)
		.orderBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`);

	const dataMap = new Map<string, number>();
	for (const row of rows) {
		dataMap.set(row.date, Number(row.count));
	}

	const buckets: TimeDistributionBucket[] = [];
	if (rangeStart && rangeEnd) {
		const current = new Date(rangeStart);
		current.setHours(0, 0, 0, 0);
		while (current <= rangeEnd) {
			const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
			const label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			buckets.push({ label, count: dataMap.get(dateStr) ?? 0 });
			current.setDate(current.getDate() + 1);
		}
	} else {
		for (const row of rows) {
			const d = new Date(row.date + 'T12:00:00');
			const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			buckets.push({ label, count: Number(row.count) });
		}
	}

	return { granularity, buckets };
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
