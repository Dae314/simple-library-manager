import type { PageServerLoad } from './$types';
import { statisticsService, type StatisticsFilters } from '$lib/server/services/statistics.js';
import { configService } from '$lib/server/services/config.js';

export const load: PageServerLoad = async ({ url }) => {
	const timeRangeStart = url.searchParams.get('timeRangeStart') || '';
	const timeRangeEnd = url.searchParams.get('timeRangeEnd') || '';
	const conventionDay = url.searchParams.get('conventionDay') || '';
	const gameTitle = url.searchParams.get('gameTitle') || '';
	const attendeeName = url.searchParams.get('attendeeName') || '';
	const status = url.searchParams.get('status') || '';
	const gameType = url.searchParams.get('gameType') || '';
	const groupByBgg = url.searchParams.get('groupByBgg') === 'true';
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

	const config = await configService.get();

	// Build filters
	const filters: StatisticsFilters = {};

	if (timeRangeStart && timeRangeEnd) {
		filters.timeRange = {
			start: new Date(timeRangeStart + 'T00:00:00'),
			end: new Date(timeRangeEnd + 'T23:59:59.999')
		};
	} else if (timeRangeStart) {
		filters.timeRange = {
			start: new Date(timeRangeStart + 'T00:00:00'),
			end: new Date('2099-12-31T23:59:59.999')
		};
	} else if (timeRangeEnd) {
		filters.timeRange = {
			start: new Date('2000-01-01T00:00:00'),
			end: new Date(timeRangeEnd + 'T23:59:59.999')
		};
	}

	if (conventionDay) {
		const dayNum = parseInt(conventionDay, 10);
		if (!isNaN(dayNum) && dayNum > 0) {
			filters.conventionDay = dayNum;
		}
	}

	if (gameTitle) {
		filters.gameTitle = gameTitle;
	}

	if (attendeeName) {
		filters.attendeeName = attendeeName;
	}

	if (status === 'available' || status === 'checked_out') {
		filters.availabilityStatus = status;
	}

	if (gameType === 'standard' || gameType === 'play_and_win' || gameType === 'play_and_take') {
		filters.gameType = gameType;
	}

	if (groupByBgg) {
		filters.groupByBggTitle = true;
	}

	const statistics = await statisticsService.getStatistics(filters, { page, pageSize });

	// Derive convention days from config dates
	const conventionDays: { value: string; label: string }[] = [];
	if (config.startDate && config.endDate) {
		const start = new Date(config.startDate);
		const end = new Date(config.endDate);
		let dayNum = 1;
		const current = new Date(start);
		while (current <= end) {
			conventionDays.push({
				value: String(dayNum),
				label: `Day ${dayNum} (${current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
			});
			current.setDate(current.getDate() + 1);
			dayNum++;
		}
	}

	return {
		statistics,
		conventionDays,
		filters: {
			timeRangeStart,
			timeRangeEnd,
			conventionDay,
			gameTitle,
			attendeeName,
			status,
			gameType,
			groupByBgg,
			page,
			pageSize
		}
	};
};
