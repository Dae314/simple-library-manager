import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

// Determine the server's IANA timezone for PostgreSQL session timezone.
// With timestamptz columns, this ensures EXTRACT(HOUR FROM ...) and TO_CHAR(...)
// return values in the server's local timezone (e.g., 'Pacific/Honolulu').
const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	// The 'options' property is sent as a startup parameter to PostgreSQL.
	// It's processed during connection handshake, before any queries run.
	options: `-c timezone=${serverTimezone}`
});

export const db = drizzle(pool, { schema });
