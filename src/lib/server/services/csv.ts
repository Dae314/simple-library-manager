import Papa from 'papaparse';
import { db } from '../db/index.js';
import { games } from '../db/schema.js';
import { eq, max, asc } from 'drizzle-orm';
import { validateCsvRows } from '../validation.js';

// --- Types ---

export interface CsvValidationResponse {
	valid: boolean;
	errors: { row: number; message: string }[];
	rowCount: number;
}

// --- CSV Service ---

export const csvService = {
	/**
	 * Validate a CSV file's contents without importing.
	 * Returns validation result with error details and row count.
	 */
	async validateImport(fileContent: string): Promise<CsvValidationResponse> {
		const parsed = Papa.parse<Record<string, string>>(fileContent, {
			header: true,
			skipEmptyLines: true,
			transformHeader: (h) => h.trim()
		});

		if (parsed.errors.length > 0) {
			const errors = parsed.errors.map((e) => ({
				row: (e.row ?? 0) + 1,
				message: e.message
			}));
			return { valid: false, errors, rowCount: 0 };
		}

		if (parsed.data.length === 0) {
			return {
				valid: false,
				errors: [{ row: 0, message: 'CSV file is empty or has no data rows' }],
				rowCount: 0
			};
		}

		const result = validateCsvRows(parsed.data);
		const totalGames = result.rows.reduce((sum, row) => sum + row.copyCount, 0);

		return {
			valid: result.valid,
			errors: result.errors,
			rowCount: result.valid ? totalGames : 0
		};
	},

	/**
	 * Import games from validated CSV content.
	 * Validates all rows first — if any errors exist, nothing is imported.
	 * Copy numbers are auto-generated per BGG_ID within a transaction.
	 */
	async importGames(fileContent: string): Promise<{ created: number }> {
		const parsed = Papa.parse<Record<string, string>>(fileContent, {
			header: true,
			skipEmptyLines: true,
			transformHeader: (h) => h.trim()
		});

		if (parsed.errors.length > 0) {
			throw new Error(`CSV parse errors: ${parsed.errors.map((e) => e.message).join('; ')}`);
		}

		const result = validateCsvRows(parsed.data);

		if (!result.valid) {
			throw new Error(`CSV contains ${result.errors.length} validation error(s)`);
		}

		return await db.transaction(async (tx) => {
			let created = 0;

			for (const row of result.rows) {
				const [maxResult] = await tx
					.select({ maxCopy: max(games.copyNumber) })
					.from(games)
					.where(eq(games.bggId, row.bggId));

				let nextCopyNumber = (maxResult?.maxCopy ?? 0) + 1;

				for (let c = 0; c < row.copyCount; c++) {
					await tx.insert(games).values({
						title: row.title,
						bggId: row.bggId,
						copyNumber: nextCopyNumber,
						status: 'available',
						gameType: 'standard'
					});
					nextCopyNumber++;
					created++;
				}
			}

			return { created };
		});
	},

	/**
	 * Export all games as a CSV string.
	 * Columns: title, BGG_ID, copy_number, status
	 */
	async exportGames(): Promise<string> {
		const allGames = await db
			.select({
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				status: games.status
			})
			.from(games)
			.orderBy(asc(games.title), asc(games.copyNumber));

		return Papa.unparse(
			allGames.map((g) => ({
				title: g.title,
				BGG_ID: g.bggId,
				copy_number: g.copyNumber,
				status: g.status
			}))
		);
	}
};
