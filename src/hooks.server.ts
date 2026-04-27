import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '$lib/server/db/index.js';
import { seed } from '$lib/server/db/seed.js';

try {
	await migrate(db, { migrationsFolder: './drizzle/migrations' });
	console.log('Database migrations completed successfully');

	await seed();
} catch (error) {
	console.error('Database startup failed:', error);
	throw error;
}
