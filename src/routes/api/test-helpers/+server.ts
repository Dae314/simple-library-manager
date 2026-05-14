import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index.js';
import { games, transactions, conventionConfig } from '$lib/server/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { gameService } from '$lib/server/services/games.js';

/**
 * POST /api/test-helpers
 *
 * A lightweight JSON API for integration tests to create and clean up
 * their own isolated data without going through the UI.
 *
 * Actions:
 *   createGame    — insert a game, returns { id, version, copyNumber }
 *   deleteGames   — delete games (and their transactions) by id array
 *   updateConfig  — update convention config fields directly
 */
export const POST: RequestHandler = async ({ request }) => {
	if (env.ALLOW_TEST_RESET !== 'true') {
		return new Response(JSON.stringify({ error: 'Not available' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const body = await request.json();

		switch (body.action) {
			case 'createGame': {
				const game = await gameService.create({
					title: body.title,
					bggId: body.bggId ?? 99999,
					prizeType: body.gameType ?? body.prizeType ?? 'standard',
					shelfCategory: body.shelfCategory ?? 'standard'
				});
				return json({ id: game.id, version: game.version, copyNumber: game.copyNumber });
			}

			case 'deleteGames': {
				const ids: number[] = body.ids;
				if (!Array.isArray(ids) || ids.length === 0) {
					return json({ deleted: 0 });
				}
				// Delete transactions first (FK constraint), then games
				await db.delete(transactions).where(inArray(transactions.gameId, ids));
				await db.delete(games).where(inArray(games.id, ids));
				return json({ deleted: ids.length });
			}

			case 'updateConfig': {
				const updates: Record<string, unknown> = {};
				if (body.conventionName !== undefined) updates.conventionName = body.conventionName;
				if (body.startDate !== undefined) updates.startDate = body.startDate;
				if (body.endDate !== undefined) updates.endDate = body.endDate;
				if (body.weightTolerance !== undefined) updates.weightTolerance = body.weightTolerance;
				if (body.weightUnit !== undefined) updates.weightUnit = body.weightUnit;

				if (Object.keys(updates).length > 0) {
					await db.update(conventionConfig).set(updates).where(eq(conventionConfig.id, 1));
				}
				return json({ success: true });
			}

			default:
				return new Response(JSON.stringify({ error: `Unknown action: ${body.action}` }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

function json(data: unknown) {
	return new Response(JSON.stringify(data), {
		headers: { 'Content-Type': 'application/json' }
	});
}
