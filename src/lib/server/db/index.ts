import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

// Determine the server's IANA timezone for PostgreSQL session timezone
const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL
});

// Set session timezone on each new connection so EXTRACT/TO_CHAR use local time
pool.on('connect', (client) => {
	client.query(`SET timezone = '${serverTimezone}'`);
});

export const db = drizzle(pool, { schema });
