import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { gameService } from '$lib/server/services/games.js';
import { validateGameInput } from '$lib/server/validation.js';
import { isDuplicateKeyError, getUserFriendlyDbMessage } from '$lib/server/services/db-errors.js';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) {
		error(404, 'Game not found');
	}

	const game = await gameService.getById(id);
	if (!game) {
		error(404, 'Game not found');
	}

	return { game };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = parseInt(params.id, 10);
		const formData = await request.formData();

		const title = formData.get('title')?.toString() || '';
		const rawBggId = formData.get('bggId');
		const gameType = formData.get('gameType')?.toString() || 'standard';

		const bggId = rawBggId ? parseInt(rawBggId.toString(), 10) : undefined;

		const values = { title, bggId: rawBggId?.toString() ?? '', gameType };

		const validation = validateGameInput({
			title,
			bggId: bggId !== undefined && !isNaN(bggId) ? bggId : undefined,
			gameType: gameType as 'standard' | 'play_and_win' | 'play_and_take'
		});

		if (!validation.valid) {
			return fail(400, { errors: validation.errors, values });
		}

		try {
			await gameService.update(id, validation.data!);
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

		redirect(303, '/management');
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
			await gameService.toggleStatus(id, newStatus, version);
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
	}
};
