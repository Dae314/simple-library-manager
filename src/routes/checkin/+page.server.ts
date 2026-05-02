import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { gameService } from '$lib/server/services/games.js';
import { transactionService } from '$lib/server/services/transactions.js';
import { configService } from '$lib/server/services/config.js';
import { validateCheckinInput } from '$lib/server/validation.js';
import { getUserFriendlyDbMessage } from '$lib/server/services/db-errors.js';
import { broadcastGameEvent, broadcastTransactionEvent } from '$lib/server/ws/broadcast.js';
import type { SortParams } from '$lib/server/services/games.js';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || undefined;
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
	const sortField = url.searchParams.get('sortField') || 'title';
	const sortDir = url.searchParams.get('sortDir') || 'asc';

	const validSortFields = ['title', 'game_type', 'checkout_time', 'attendee'] as const;
	const sort: SortParams = {
		field: validSortFields.includes(sortField as any) ? (sortField as SortParams['field']) : 'title',
		direction: sortDir === 'desc' ? 'desc' : 'asc'
	};

	const [games, config] = await Promise.all([
		gameService.listCheckedOut(search, { page, pageSize }, sort),
		configService.get()
	]);

	return {
		games,
		weightUnit: config.weightUnit,
		weightTolerance: config.weightTolerance,
		sortField: sort.field,
		sortDir: sort.direction
	};
};

export const actions: Actions = {
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
	}
};
