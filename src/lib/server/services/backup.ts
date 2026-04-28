import { spawn } from 'child_process';

const MAX_IMPORT_SIZE = 100 * 1024 * 1024; // 100MB

// PostgreSQL custom format magic bytes: the file starts with "PGDMP"
const PG_DUMP_MAGIC = Buffer.from('PGDMP');

/**
 * Parse DATABASE_URL into individual connection parameters for pg_dump/pg_restore CLI tools.
 */
function parseConnectionParams(): { host: string; port: string; user: string; password: string; database: string } {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error('DATABASE_URL environment variable is not set');
	}

	const parsed = new URL(url);
	return {
		host: parsed.hostname,
		port: parsed.port || '5432',
		user: parsed.username,
		password: parsed.password,
		database: parsed.pathname.replace(/^\//, '')
	};
}

/**
 * Validate that the uploaded buffer looks like a valid PostgreSQL custom-format dump.
 */
function validateDumpFile(buffer: Buffer): void {
	if (buffer.length === 0) {
		throw new Error('Uploaded file is empty');
	}

	if (buffer.length > MAX_IMPORT_SIZE) {
		throw new Error(`File size exceeds the maximum allowed size of ${MAX_IMPORT_SIZE / (1024 * 1024)}MB`);
	}

	// Check for PostgreSQL custom format magic bytes
	if (buffer.length < PG_DUMP_MAGIC.length || !buffer.subarray(0, PG_DUMP_MAGIC.length).equals(PG_DUMP_MAGIC)) {
		throw new Error('Invalid file: not a valid PostgreSQL dump file');
	}
}

export const backupService = {
	/**
	 * Export the database as a streaming pg_dump in custom format.
	 * Returns a ReadableStream suitable for piping to an HTTP response.
	 */
	async exportDatabase(): Promise<ReadableStream> {
		const conn = parseConnectionParams();

		const pgDump = spawn('pg_dump', [
			'-h', conn.host,
			'-p', conn.port,
			'-U', conn.user,
			'-d', conn.database,
			'-Fc'  // custom format (compressed, restorable)
		], {
			env: { ...process.env, PGPASSWORD: conn.password }
		});

		return new Promise<ReadableStream>((resolve, reject) => {
			let stderrOutput = '';
			let resolved = false;

			pgDump.stderr.on('data', (chunk: Buffer) => {
				stderrOutput += chunk.toString();
			});

			const stream = new ReadableStream({
				start(controller) {
					pgDump.stdout.on('data', (chunk: Buffer) => {
						controller.enqueue(new Uint8Array(chunk));
						if (!resolved) {
							resolved = true;
							resolve(stream);
						}
					});

					pgDump.stdout.on('end', () => {
						controller.close();
					});

					pgDump.on('error', (err) => {
						const error = new Error(`Failed to start pg_dump: ${err.message}`);
						if (!resolved) {
							reject(error);
						} else {
							controller.error(error);
						}
					});

					pgDump.on('close', (code) => {
						if (code !== 0) {
							const errMsg = stderrOutput.trim() || `pg_dump exited with code ${code}`;
							const error = new Error(`Database export failed: ${errMsg}`);
							if (!resolved) {
								reject(error);
							} else {
								controller.error(error);
							}
						}
					});
				}
			});
		});
	},

	/**
	 * Import a database from an uploaded file using pg_restore.
	 * Validates the file before restoring. Replaces all existing data.
	 */
	async importDatabase(file: File): Promise<void> {
		const buffer = Buffer.from(await file.arrayBuffer());

		validateDumpFile(buffer);

		const conn = parseConnectionParams();

		return new Promise<void>((resolve, reject) => {
			const pgRestore = spawn('pg_restore', [
				'-h', conn.host,
				'-p', conn.port,
				'-U', conn.user,
				'-d', conn.database,
				'--clean',       // drop existing objects before restoring
				'--if-exists',   // don't error if objects don't exist yet
				'--no-owner',    // don't try to set ownership
				'--no-privileges' // don't try to set privileges
			], {
				env: { ...process.env, PGPASSWORD: conn.password }
			});

			let stderrOutput = '';

			pgRestore.stderr.on('data', (chunk: Buffer) => {
				stderrOutput += chunk.toString();
			});

			pgRestore.on('error', (err) => {
				reject(new Error(`Failed to start pg_restore: ${err.message}`));
			});

			pgRestore.on('close', (code) => {
				// pg_restore may exit with code 1 for non-fatal warnings (e.g., "role does not exist")
				// We treat exit code 0 and 1 as success since --clean --if-exists can produce warnings
				if (code !== null && code > 1) {
					const errMsg = stderrOutput.trim() || `pg_restore exited with code ${code}`;
					reject(new Error(`Database import failed: ${errMsg}`));
				} else {
					resolve();
				}
			});

			// Write the dump data to pg_restore's stdin
			pgRestore.stdin.write(buffer);
			pgRestore.stdin.end();
		});
	}
};
