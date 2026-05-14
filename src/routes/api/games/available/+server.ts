import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gameService } from '$lib/server/services/games.js';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const pageSize = Math.max(1, Math.min(50, parseInt(url.searchParams.get('pageSize') ?? '10', 10) || 10));

	try {
		const result = await gameService.listAvailable(
			q || undefined,
			{ page, pageSize }
		);

		// Map to lightweight records: id, title, bggId, copyNumber
		const games = result.items.map((game) => ({
			id: game.id,
			title: game.title,
			bggId: game.bggId,
			copyNumber: game.copyNumber
		}));

		return json({ games, total: result.total });
	} catch {
		return json({ error: 'Failed to fetch available games' }, { status: 500 });
	}
};
