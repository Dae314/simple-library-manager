import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index.js';
import { games } from '$lib/server/db/schema.js';
import { count, eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [totalResult] = await db.select({ value: count() }).from(games);
	const [availableResult] = await db.select({ value: count() }).from(games).where(eq(games.status, 'available'));
	const [checkedOutResult] = await db.select({ value: count() }).from(games).where(eq(games.status, 'checked_out'));
	const [retiredResult] = await db.select({ value: count() }).from(games).where(eq(games.status, 'retired'));

	return {
		counts: {
			total: totalResult.value,
			available: availableResult.value,
			checkedOut: checkedOutResult.value,
			retired: retiredResult.value
		}
	};
};
