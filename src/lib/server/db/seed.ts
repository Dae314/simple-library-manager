import { count } from 'drizzle-orm';
import { db } from './index.js';
import { games, conventionConfig, idTypes } from './schema.js';

const SEED_GAMES = [
	{ title: 'Catan', bggId: 13, prizeType: 'standard' },
	{ title: 'Catan', bggId: 13, prizeType: 'standard' },
	{ title: 'Ticket to Ride', bggId: 9209, prizeType: 'standard' },
	{ title: 'Ticket to Ride', bggId: 9209, prizeType: 'standard' },
	{ title: 'Pandemic', bggId: 30549, prizeType: 'standard' },
	{ title: 'Azul', bggId: 230802, prizeType: 'standard' },
	{ title: 'Codenames', bggId: 178900, prizeType: 'play_and_win' },
	{ title: 'Wingspan', bggId: 266192, prizeType: 'standard' },
	{ title: '7 Wonders', bggId: 68448, prizeType: 'play_and_take' },
	{ title: 'Splendor', bggId: 148228, prizeType: 'standard' }
] as const;

export async function seed(): Promise<void> {
	const [result] = await db.select({ value: count() }).from(games);
	if (result.value > 0) {
		return;
	}

	// Track copy numbers per BGG ID
	const copyNumbers = new Map<number, number>();

	const rows = SEED_GAMES.map((game) => {
		const current = (copyNumbers.get(game.bggId) ?? 0) + 1;
		copyNumbers.set(game.bggId, current);
		return {
			title: game.title,
			bggId: game.bggId,
			copyNumber: current,
			prizeType: game.prizeType
		};
	});

	await db.insert(games).values(rows);

	// Ensure a default convention config row exists
	const [configResult] = await db.select({ value: count() }).from(conventionConfig);
	if (configResult.value === 0) {
		await db.insert(conventionConfig).values({});
	}

	// Seed default ID types
	const [idTypeResult] = await db.select({ value: count() }).from(idTypes);
	if (idTypeResult.value === 0) {
		await db.insert(idTypes).values([
			{ name: "Driver's License" },
			{ name: 'Student ID' },
			{ name: 'State ID' }
		]);
		console.log('Seeded 2 default ID types');
	}

	console.log(`Seeded ${rows.length} example games`);
}
