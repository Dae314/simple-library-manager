import type { PageServerLoad } from './$types';
import { gameService } from '$lib/server/services/games.js';
import type { GameStatus, GameType, GameFilters } from '$lib/server/services/games.js';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || undefined;
	const status = url.searchParams.get('status') as GameStatus | null;
	const gameType = url.searchParams.get('gameType') as GameType | null;
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

	const filters: GameFilters = {
		excludeStatus: 'retired'
	};

	if (status === 'available' || status === 'checked_out') {
		filters.status = status;
	}
	if (gameType === 'standard' || gameType === 'play_and_win' || gameType === 'play_and_take') {
		filters.gameType = gameType;
	}
	if (search) {
		filters.titleSearch = search;
	}

	const games = await gameService.list(filters, { page, pageSize });

	return {
		games,
		activeStatus: status || '',
		activeGameType: gameType || '',
		activeSearch: search || ''
	};
};
