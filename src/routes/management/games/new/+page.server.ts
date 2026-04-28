import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { gameService } from '$lib/server/services/games.js';
import { validateGameInput } from '$lib/server/validation.js';

export const actions: Actions = {
	default: async ({ request }) => {
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

		await gameService.create(validation.data!);
		redirect(303, '/management');
	}
};
