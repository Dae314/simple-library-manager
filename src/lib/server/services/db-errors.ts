/**
 * Shared database error helpers for PostgreSQL constraint violations.
 * Handles both raw pg errors and Drizzle ORM wrapped errors.
 */

/**
 * Extract the underlying PostgreSQL error, which may be nested in a Drizzle wrapper.
 * Drizzle wraps pg errors with a message like "Failed query:..." and stores the
 * original error in the `cause` property.
 */
function getDbError(err: unknown): Record<string, unknown> | null {
	if (typeof err !== 'object' || err === null) return null;

	const obj = err as Record<string, unknown>;

	// Direct pg error (has `code` like '23505')
	if ('code' in obj && typeof obj.code === 'string' && /^\d{5}$/.test(obj.code)) {
		return obj;
	}

	// Drizzle wraps the pg error in `cause`
	if ('cause' in obj && typeof obj.cause === 'object' && obj.cause !== null) {
		const cause = obj.cause as Record<string, unknown>;
		if ('code' in cause && typeof cause.code === 'string' && /^\d{5}$/.test(cause.code)) {
			return cause;
		}
	}

	return null;
}

/**
 * Check if an error is a PostgreSQL unique constraint violation (code 23505).
 */
export function isDuplicateKeyError(err: unknown): boolean {
	const dbErr = getDbError(err);
	return dbErr !== null && dbErr.code === '23505';
}

/**
 * Check if an error is a PostgreSQL foreign key violation (code 23503).
 */
export function isForeignKeyError(err: unknown): boolean {
	const dbErr = getDbError(err);
	return dbErr !== null && dbErr.code === '23503';
}

/**
 * Convert a database error into a user-friendly message.
 * Avoids exposing raw SQL, table names, or internal details.
 */
export function getUserFriendlyDbMessage(err: unknown): string {
	const dbErr = getDbError(err);

	if (dbErr) {
		switch (dbErr.code) {
			case '23505': // unique_violation
				return 'This record already exists. Please use a different value.';
			case '23503': // foreign_key_violation
				return 'This record is referenced by other data and cannot be modified.';
			case '23502': // not_null_violation
				return 'A required field is missing.';
			case '23514': // check_violation
				return 'The provided value is outside the allowed range.';
			default:
				return 'A database error occurred. Please try again.';
		}
	}

	// For non-database errors, sanitize the message to avoid leaking internals
	if (err instanceof Error) {
		const msg = err.message;
		// If it looks like a raw SQL error, don't expose it
		if (msg.includes('Failed query:') || msg.includes('INSERT INTO') || msg.includes('UPDATE') || msg.includes('SELECT')) {
			return 'A database error occurred. Please try again.';
		}
		// Known application-level errors are safe to show
		if (msg.includes('Conflict') || msg.includes('not found') || msg.includes('not currently checked out')) {
			return msg;
		}
	}

	return 'An unexpected error occurred. Please try again.';
}
