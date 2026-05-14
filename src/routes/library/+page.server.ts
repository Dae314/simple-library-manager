import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { gameService } from '$lib/server/services/games.js';
import { transactionService } from '$lib/server/services/transactions.js';
import { configService } from '$lib/server/services/config.js';
import { validateCheckoutInput, validateCheckinInput, validateSwapInput } from '$lib/server/validation.js';
import { getUserFriendlyDbMessage } from '$lib/server/services/db-errors.js';
import { broadcastGameEvent, broadcastTransactionEvent } from '$lib/server/ws/broadcast.js';
import type { LibraryFilters, LibrarySortParams } from '$lib/server/services/games.js';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || undefined;
	const attendeeSearch = url.searchParams.get('attendeeSearch') || undefined;
	const status = url.searchParams.get('status') as 'available' | 'checked_out' | null;
	const prizeType = (url.searchParams.get('prizeType') || url.searchParams.get('gameType') || null) as 'standard' | 'play_and_win' | 'play_and_take' | null;
	const shelfCategory = url.searchParams.get('shelfCategory') as 'family' | 'small' | 'standard' | null;
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);
	const sortField = url.searchParams.get('sortField') || 'title';
	const sortDir = url.searchParams.get('sortDir') || 'asc';

	const filters: LibraryFilters = {};

	if (status === 'available' || status === 'checked_out') {
		filters.status = status;
	}
	if (prizeType === 'standard' || prizeType === 'play_and_win' || prizeType === 'play_and_take') {
		filters.prizeType = prizeType;
	}
	if (shelfCategory === 'family' || shelfCategory === 'small' || shelfCategory === 'standard') {
		filters.shelfCategory = shelfCategory;
	}
	if (search) {
		filters.titleSearch = search;
	}
	if (attendeeSearch) {
		filters.attendeeSearch = attendeeSearch;
	}

	const validSortFields = ['title', 'prize_type', 'game_type', 'shelf_category', 'status', 'bgg_id'] as const;
	const sort: LibrarySortParams = {
		field: validSortFields.includes(sortField as any) ? (sortField as LibrarySortParams['field']) : 'title',
		direction: sortDir === 'desc' ? 'desc' : 'asc'
	};

	const [games, idTypes, config] = await Promise.all([
		gameService.listLibrary(filters, { page, pageSize }, sort),
		configService.getIdTypes(),
		configService.get()
	]);

	// Look up the last recorded weight for each available game on this page
	const gameIds = games.items.map((g) => g.id);
	const lastWeights = gameIds.length > 0 ? await gameService.getLastWeights(gameIds) : {};

	return {
		games,
		idTypes,
		weightUnit: config.weightUnit,
		weightTolerance: config.weightTolerance,
		lastWeights,
		sortField: sort.field,
		sortDir: sort.direction,
		activeStatus: status || '',
		activePrizeType: prizeType || '',
		activeShelfCategory: shelfCategory || '',
		activeSearch: search || '',
		activeAttendeeSearch: attendeeSearch || ''
	};
};

export const actions: Actions = {
	checkout: async ({ request }) => {
		const formData = await request.formData();

		const rawGameId = formData.get('gameId');
		const rawGameVersion = formData.get('gameVersion');
		const attendeeFirstName = formData.get('attendeeFirstName')?.toString() || '';
		const attendeeLastName = formData.get('attendeeLastName')?.toString() || '';
		const idType = formData.get('idType')?.toString() || '';
		const rawCheckoutWeight = formData.get('checkoutWeight');
		const note = formData.get('note')?.toString() || '';

		const gameId = rawGameId ? parseInt(rawGameId.toString(), 10) : undefined;
		const gameVersion = rawGameVersion ? parseInt(rawGameVersion.toString(), 10) : undefined;
		const checkoutWeight = rawCheckoutWeight ? parseFloat(rawCheckoutWeight.toString()) : undefined;

		const values = { attendeeFirstName, attendeeLastName, idType, checkoutWeight, note };

		const validation = validateCheckoutInput({
			gameId,
			gameVersion,
			attendeeFirstName,
			attendeeLastName,
			idType,
			checkoutWeight,
			note: note || undefined
		});

		if (!validation.valid) {
			return fail(400, { errors: validation.errors, values });
		}

		try {
			const transaction = await transactionService.checkout(validation.data!);
			broadcastGameEvent('game_checked_out', transaction.gameId);
			broadcastTransactionEvent(transaction.id, transaction.gameId);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('Conflict')) {
				return fail(409, {
					conflict: true,
					message: 'This game was just checked out by another station.'
				});
			}
			return fail(500, { error: getUserFriendlyDbMessage(err) });
		}
	},

	checkin: async ({ request }) => {
		const formData = await request.formData();

		const rawGameId = formData.get('gameId');
		const rawCheckinWeight = formData.get('checkinWeight');
		const note = formData.get('note')?.toString() || '';
		const attendeeTakesGame = formData.get('attendeeTakesGame') === 'true';

		const gameId = rawGameId ? parseInt(rawGameId.toString(), 10) : undefined;
		const checkinWeight = rawCheckinWeight ? parseFloat(rawCheckinWeight.toString()) : undefined;

		const values = { checkinWeight, note };

		const validation = validateCheckinInput({
			gameId,
			checkinWeight,
			note: note || undefined,
			attendeeTakesGame
		});

		if (!validation.valid) {
			return fail(400, { errors: validation.errors, values, gameId });
		}

		try {
			const result = await transactionService.checkin(validation.data!);

			broadcastGameEvent('game_checked_in', validation.data!.gameId);
			broadcastTransactionEvent(result.transaction.id, validation.data!.gameId);

			// Get config for weight unit in warning display
			const config = await configService.get();

			if (result.weightWarning) {
				return {
					success: true,
					weightWarning: {
						...result.weightWarning,
						weightUnit: config.weightUnit
					}
				};
			}

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('not currently checked out')) {
				return fail(409, {
					conflict: true,
					message: 'This game is no longer checked out.'
				});
			}
			return fail(500, { error: getUserFriendlyDbMessage(err), gameId });
		}
	},

	swap: async ({ request }) => {
		const formData = await request.formData();

		const rawReturnGameId = formData.get('returnGameId');
		const rawNewGameId = formData.get('newGameId');
		const rawCheckinWeight = formData.get('checkinWeight');
		const rawCheckoutWeight = formData.get('checkoutWeight');

		const returnGameId = rawReturnGameId ? parseInt(rawReturnGameId.toString(), 10) : undefined;
		const newGameId = rawNewGameId ? parseInt(rawNewGameId.toString(), 10) : undefined;
		const checkinWeight = rawCheckinWeight ? parseFloat(rawCheckinWeight.toString()) : undefined;
		const checkoutWeight = rawCheckoutWeight ? parseFloat(rawCheckoutWeight.toString()) : undefined;

		const validation = validateSwapInput({
			returnGameId,
			newGameId,
			checkinWeight,
			checkoutWeight
		});

		if (!validation.valid) {
			return fail(400, { errors: validation.errors });
		}

		try {
			const result = await transactionService.swap(validation.data!);

			// Get config for weight unit in warning display
			const config = await configService.get();

			if (result.weightWarning) {
				return {
					success: true,
					weightWarning: {
						...result.weightWarning,
						weightUnit: config.weightUnit
					}
				};
			}

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('Conflict') || message.includes('not currently checked out') || message.includes('not available')) {
				return fail(409, {
					conflict: true,
					message: message
				});
			}
			return fail(500, { error: getUserFriendlyDbMessage(err) });
		}
	}
};
