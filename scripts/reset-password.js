#!/usr/bin/env node

/**
 * Password Reset Script
 *
 * Clears the management password from the convention_config table,
 * restoring open access to all management routes.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname node scripts/reset-password.js
 *
 * The DATABASE_URL environment variable must be set to the PostgreSQL connection string.
 */

import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	console.error('Error: DATABASE_URL environment variable is not set.');
	process.exit(1);
}

const client = new Client({ connectionString });

try {
	await client.connect();
	const result = await client.query(
		'UPDATE convention_config SET password_hash = NULL WHERE id = 1'
	);

	if (result.rowCount === 0) {
		console.warn('Warning: No convention_config row found. Nothing to reset.');
	} else {
		console.log(
			'Password has been cleared. Management pages are now accessible without a password.'
		);
	}
} catch (err) {
	console.error('Error: Failed to reset password.', err.message);
	process.exit(1);
} finally {
	await client.end();
}
