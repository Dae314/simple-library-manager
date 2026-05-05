import type { PageServerLoad, Actions } from './$types';
import { gameService } from '$lib/server/services/games.js';
import type { GameStatus, GameType, GameFilters, SortParams } from '$lib/server/services/games.js';
import { csvService } from '$lib/server/services/csv.js';
import { fail } from '@sveltejs/kit';
import { getUserFriendlyDbMessage } from '$lib/server/services/db-errors.js';
import { broadcastBatchGameEvent, broadcastGameEvent } from '$lib/server/ws/broadcast.js';
import { configService } from '$lib/server/services/config.js';
import { authService } from '$lib/server/services/auth.js';

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
	const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

	const filters: GameFilters = {};

	if (status === 'available' || status === 'checked_out' || status === 'retired') {
		filters.status = status as GameStatus;
	} else {
		// By default, hide retired games unless explicitly filtered
		filters.excludeStatus = 'retired';
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
	if (groupByBgg) {
		filters.groupByBgg = true;
	}

	const validSortFields = ['title', 'bgg_id', 'status', 'game_type', 'last_transaction_date', 'created_at'] as const;
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
			broadcastBatchGameEvent(ids);
			return { success: true, action: 'retire', count: ids.length };
		} catch (e) {
			return fail(500, { error: getUserFriendlyDbMessage(e) });
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
			broadcastGameEvent('game_restored', id);
			return { success: true, action: 'restore' };
		} catch (e) {
			return fail(500, { error: getUserFriendlyDbMessage(e) });
		}
	},

	csvImport: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('csvFile') as File | null;

		if (!file || file.size === 0) {
			return fail(400, { csvError: 'Please select a CSV file to import' });
		}

		// Password confirmation check when password is set
		const passwordHash = await configService.getPasswordHash();
		if (passwordHash) {
			const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';
			if (!confirmPassword) {
				return fail(400, { csvError: 'Password confirmation is required' });
			}
			const isValid = await authService.verifyPassword(confirmPassword, passwordHash);
			if (!isValid) {
				return fail(400, { csvError: 'Incorrect password' });
			}
		}

		const fileContent = await file.text();

		// Validate first
		const validation = await csvService.validateImport(fileContent);

		if (!validation.valid) {
			return fail(400, {
				csvError: 'CSV validation failed',
				csvErrors: validation.errors
			});
		}

		// Import
		try {
			const result = await csvService.importGames(fileContent);
			broadcastBatchGameEvent(result.gameIds);
			return {
				success: true,
				action: 'csvImport',
				csvImported: result.added + result.modified + result.deleted,
				csvImportSummary: {
					added: result.added,
					modified: result.modified,
					deleted: result.deleted
				}
			};
		} catch (e) {
			return fail(500, { csvError: `Import failed: ${getUserFriendlyDbMessage(e)}` });
		}
	},

	csvValidate: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('csvFile') as File | null;

		if (!file || file.size === 0) {
			return fail(400, { csvError: 'Please select a CSV file' });
		}

		const fileContent = await file.text();
		const validation = await csvService.validateImport(fileContent);

		return {
			csvValidation: validation,
			csvFileContent: fileContent
		};
	},

	csvExport: async () => {
		try {
			const csvString = await csvService.exportGames();
			return { csvExportData: csvString };
		} catch (e) {
			return fail(500, { csvError: getUserFriendlyDbMessage(e) });
		}
	}
};
