import type { PageServerLoad, Actions } from './$types';
import { gameService } from '$lib/server/services/games.js';
import type { GameStatus, GameType, GameFilters, SortParams } from '$lib/server/services/games.js';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || '';
	const status = url.searchParams.get('status') || '';
	const gameType = url.searchParams.get('gameType') || '';
	const sortField = url.searchParams.get('sortField') || 'title';
	const sortDir = url.searchParams.get('sortDir') || 'asc';
	const createdSince = url.searchParams.get('createdSince') || '';
	const lastCheckedOutBefore = url.searchParams.get('lastCheckedOutBefore') || '';
	const lastTransactionStart = url.searchParams.get('lastTransactionStart') || '';
	const lastTransactionEnd = url.searchParams.get('lastTransactionEnd') || '';
	const groupByBgg = url.searchParams.get('groupByBgg') === 'true';
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

	const filters: GameFilters = {};

	if (status === 'available' || status === 'checked_out' || status === 'retired') {
		filters.status = status as GameStatus;
	}
	if (gameType === 'standard' || gameType === 'play_and_win' || gameType === 'play_and_take') {
		filters.gameType = gameType as GameType;
	}
	if (search) {
		filters.titleSearch = search;
	}
	if (createdSince) {
		filters.createdSince = new Date(createdSince);
	}
	if (lastCheckedOutBefore) {
		filters.lastCheckedOutBefore = new Date(lastCheckedOutBefore);
	}
	if (lastTransactionStart) {
		filters.lastTransactionStart = new Date(lastTransactionStart);
	}
	if (lastTransactionEnd) {
		filters.lastTransactionEnd = new Date(lastTransactionEnd);
	}

	const validSortFields = ['title', 'bgg_id', 'status', 'game_type', 'last_transaction_date'] as const;
	const sort: SortParams = {
		field: validSortFields.includes(sortField as any) ? (sortField as SortParams['field']) : 'title',
		direction: sortDir === 'desc' ? 'desc' : 'asc'
	};

	const games = await gameService.list(filters, { page, pageSize }, sort);

	return {
		games,
		filters: {
			search,
			status,
			gameType,
			sortField: sort.field,
			sortDir: sort.direction,
			createdSince,
			lastCheckedOutBefore,
			lastTransactionStart,
			lastTransactionEnd,
			groupByBgg,
			page,
			pageSize
		}
	};
};

export const actions: Actions = {
	retire: async ({ request }) => {
		const formData = await request.formData();
		const idsStr = formData.get('ids') as string;

		if (!idsStr) {
			return fail(400, { error: 'No games selected' });
		}

		const ids = idsStr.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);

		if (ids.length === 0) {
			return fail(400, { error: 'No valid game IDs provided' });
		}

		try {
			await gameService.retire(ids);
			return { success: true, action: 'retire', count: ids.length };
		} catch (e) {
			return fail(500, { error: 'Failed to retire games' });
		}
	},

	restore: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id || isNaN(id)) {
			return fail(400, { error: 'Invalid game ID' });
		}

		try {
			await gameService.restore(id);
			return { success: true, action: 'restore' };
		} catch (e) {
			return fail(500, { error: 'Failed to restore game' });
		}
	}
};
