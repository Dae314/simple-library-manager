import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index.js';
import { games, transactions, conventionConfig, idTypes } from '$lib/server/db/schema.js';
import { seed } from '$lib/server/db/seed.js';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async () => {
	// Only allow in test environments
	if (env.ALLOW_TEST_RESET !== 'true') {
		return new Response(JSON.stringify({ error: 'Not available' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		// Delete all data in reverse dependency order
		await db.delete(transactions);
		await db.delete(games);
		await db.delete(idTypes);
		await db.delete(conventionConfig);

		// Reset sequences
		await db.execute(sql`ALTER SEQUENCE games_id_seq RESTART WITH 1`);
		await db.execute(sql`ALTER SEQUENCE transactions_id_seq RESTART WITH 1`);
		await db.execute(sql`ALTER SEQUENCE convention_config_id_seq RESTART WITH 1`);
		await db.execute(sql`ALTER SEQUENCE id_types_id_seq RESTART WITH 1`);

		// Re-seed
		await seed();

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
