import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { gameService } from '$lib/server/services/games.js';
import { transactionService } from '$lib/server/services/transactions.js';
import { configService } from '$lib/server/services/config.js';
import { getUserFriendlyDbMessage } from '$lib/server/services/db-errors.js';
import { validateCheckoutInput } from '$lib/server/validation.js';
import { broadcastGameEvent, broadcastTransactionEvent } from '$lib/server/ws/broadcast.js';
import type { SortParams } from '$lib/server/services/games.js';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || undefined;
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
	const sortField = url.searchParams.get('sortField') || 'title';
	const sortDir = url.searchParams.get('sortDir') || 'asc';

	const validSortFields = ['title', 'game_type'] as const;
	const sort: SortParams = {
		field: validSortFields.includes(sortField as any) ? (sortField as SortParams['field']) : 'title',
		direction: sortDir === 'desc' ? 'desc' : 'asc'
	};

	const [games, idTypes, config] = await Promise.all([
		gameService.listAvailable(search, { page, pageSize }, sort),
		configService.getIdTypes(),
		configService.get()
	]);

	// Look up the last recorded weight for each game on this page.
	// For an available game, the most recent checkin weight is the best reference.
	const gameIds = games.items.map((g) => g.id);
	const lastWeights = gameIds.length > 0 ? await gameService.getLastWeights(gameIds) : {};

	return {
		games,
		idTypes,
		weightUnit: config.weightUnit,
		lastWeights,
		sortField: sort.field,
		sortDir: sort.direction
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
	}
};
