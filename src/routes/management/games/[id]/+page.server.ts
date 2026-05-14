import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { gameService } from '$lib/server/services/games.js';
import { validateGameInput } from '$lib/server/validation.js';
import { isDuplicateKeyError, getUserFriendlyDbMessage } from '$lib/server/services/db-errors.js';
import { broadcastGameEvent, broadcastTransactionEvent } from '$lib/server/ws/broadcast.js';
import { configService } from '$lib/server/services/config.js';
import { authService } from '$lib/server/services/auth.js';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) {
		error(404, 'Game not found');
	}

	const game = await gameService.getById(id);
	if (!game) {
		error(404, 'Game not found');
	}

	const transactionCount = await gameService.getTransactionCount(id);

	return { game, transactionCount };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = parseInt(params.id, 10);
		const formData = await request.formData();

		const title = formData.get('title')?.toString() || '';
		const rawBggId = formData.get('bggId');
		const prizeType = formData.get('prizeType')?.toString() || formData.get('gameType')?.toString() || 'standard';
		const shelfCategory = formData.get('shelfCategory')?.toString() || 'standard';

		const bggId = rawBggId ? parseInt(rawBggId.toString(), 10) : undefined;

		const values = { title, bggId: rawBggId?.toString() ?? '', prizeType, shelfCategory };

		const validation = validateGameInput({
			title,
			bggId: bggId !== undefined && !isNaN(bggId) ? bggId : undefined,
			prizeType: prizeType as 'standard' | 'play_and_win' | 'play_and_take',
			shelfCategory: shelfCategory as 'family' | 'small' | 'standard'
		});

		if (!validation.valid) {
			return fail(400, { errors: validation.errors, values });
		}

		try {
			await gameService.update(id, validation.data!);
			broadcastGameEvent('game_updated', id);
		} catch (err: unknown) {
			if (isDuplicateKeyError(err)) {
				return fail(409, {
					error: 'A game with this BGG ID already exists.',
					values
				});
			}
			const message = getUserFriendlyDbMessage(err);
			return fail(500, { error: message, values });
		}

		redirect(303, '/management/games');
	},

	toggleStatus: async ({ request, params }) => {
		const id = parseInt(params.id, 10);
		const formData = await request.formData();

		const newStatus = formData.get('newStatus')?.toString() as 'available' | 'checked_out';
		const rawVersion = formData.get('version');
		const version = rawVersion ? parseInt(rawVersion.toString(), 10) : 0;

		if (!newStatus || !['available', 'checked_out'].includes(newStatus)) {
			return fail(400, { toggleError: 'Invalid status' });
		}

		try {
			const result = await gameService.toggleStatus(id, newStatus, version);
			broadcastGameEvent('game_updated', id);
			broadcastTransactionEvent(result.transactionId, id);
			return { toggleSuccess: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('Conflict')) {
				return fail(409, {
					toggleError: 'This game was modified by another user. Please refresh and try again.'
				});
			}
			return fail(500, { toggleError: 'Failed to toggle status. Please try again.' });
		}
	},

	delete: async ({ request, params }) => {
		const id = parseInt(params.id, 10);

		const passwordHash = await configService.getPasswordHash();
		if (passwordHash) {
			const formData = await request.formData();
			const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';
			if (!confirmPassword) {
				return fail(400, { deleteError: 'Password confirmation is required' });
			}
			const isValid = await authService.verifyPassword(confirmPassword, passwordHash);
			if (!isValid) {
				return fail(400, { deleteError: 'Incorrect password' });
			}
		}

		try {
			await gameService.delete(id);
			broadcastGameEvent('game_deleted', id);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to delete game';
			if (message.includes('not found')) {
				return fail(404, { deleteError: 'Game not found' });
			}
			if (message.includes('checked-out')) {
				return fail(400, { deleteError: 'Cannot delete a checked-out game. Check it in first.' });
			}
			return fail(500, { deleteError: message });
		}

		redirect(303, '/management/games?deleted=1');
	}
};
