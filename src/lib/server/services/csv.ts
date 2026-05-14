import Papa from 'papaparse';
import { db } from '../db/index.js';
import { games } from '../db/schema.js';
import { eq, and, max, asc } from 'drizzle-orm';
import { validateCsvRows } from '../validation.js';
import type { CsvValidationResult } from '../validation.js';

// --- Types ---

export interface CsvValidationResponse {
	valid: boolean;
	errors: { row: number; message: string }[];
	summary: {
		add: number;
		modify: number;
		delete: number;
	};
	rowCount: number;
}

export interface CsvImportResult {
	added: number;
	modified: number;
	deleted: number;
	gameIds: number[];
}

// --- CSV Service ---

export const csvService = {
	/**
	 * Validate a CSV file's contents without importing.
	 * Returns validation result with error details, row count, and action summary.
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
			return { valid: false, errors, rowCount: 0, summary: { add: 0, modify: 0, delete: 0 } };
		}

		if (parsed.data.length === 0) {
			return {
				valid: false,
				errors: [{ row: 0, message: 'CSV file is empty or has no data rows' }],
				rowCount: 0,
				summary: { add: 0, modify: 0, delete: 0 }
			};
		}

		const result = validateCsvRows(parsed.data);

		if (!result.valid) {
			return {
				valid: false,
				errors: result.errors,
				rowCount: 0,
				summary: { add: 0, modify: 0, delete: 0 }
			};
		}

		// For add rows, count total games (including copy_count expansion)
		const addCount = result.rows
			.filter((r) => r.action === 'add')
			.reduce((sum, row) => sum + row.copyCount, 0);
		const modifyCount = result.rows.filter((r) => r.action === 'modify').length;
		const deleteCount = result.rows.filter((r) => r.action === 'delete').length;

		// Validate that modify/delete targets exist in the database
		const lookupErrors: { row: number; message: string }[] = [];
		for (const row of result.rows) {
			if (row.action === 'modify' || row.action === 'delete') {
				const existing = await db
					.select({ id: games.id })
					.from(games)
					.where(
						and(
							eq(games.title, row.title),
							eq(games.bggId, row.bggId),
							eq(games.copyNumber, row.copyNumber!)
						)
					);

				if (existing.length === 0) {
					lookupErrors.push({
						row: row.sourceRow,
						message: `No game found matching title "${row.title}", BGG ID ${row.bggId}, copy #${row.copyNumber} for ${row.action} action`
					});
				}
			}
		}

		if (lookupErrors.length > 0) {
			return {
				valid: false,
				errors: lookupErrors,
				rowCount: 0,
				summary: { add: 0, modify: 0, delete: 0 }
			};
		}

		return {
			valid: true,
			errors: [],
			rowCount: addCount + modifyCount + deleteCount,
			summary: { add: addCount, modify: modifyCount, delete: deleteCount }
		};
	},

	/**
	 * Import games from validated CSV content.
	 * Supports three actions per row: add, modify, delete.
	 * Validates all rows first — if any errors exist, nothing is imported.
	 */
	async importGames(fileContent: string): Promise<CsvImportResult> {
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
			let added = 0;
			let modified = 0;
			let deleted = 0;
			const gameIds: number[] = [];

			for (const row of result.rows) {
				switch (row.action) {
					case 'add': {
						const [maxResult] = await tx
							.select({ maxCopy: max(games.copyNumber) })
							.from(games)
							.where(eq(games.bggId, row.bggId));

						let nextCopyNumber = (maxResult?.maxCopy ?? 0) + 1;

						for (let c = 0; c < row.copyCount; c++) {
							const [inserted] = await tx.insert(games).values({
								title: row.title,
								bggId: row.bggId,
								copyNumber: nextCopyNumber,
								status: 'available',
								prizeType: row.prizeType ?? 'standard',
								shelfCategory: row.shelfCategory ?? 'standard'
							}).returning({ id: games.id });
							gameIds.push(inserted.id);
							nextCopyNumber++;
							added++;
						}
						break;
					}

					case 'modify': {
						const [existing] = await tx
							.select({ id: games.id })
							.from(games)
							.where(
								and(
									eq(games.title, row.title),
									eq(games.bggId, row.bggId),
									eq(games.copyNumber, row.copyNumber!)
								)
							);

						if (!existing) {
							throw new Error(`Game not found for modify: "${row.title}" BGG ${row.bggId} copy #${row.copyNumber}`);
						}

						const updateValues: Record<string, unknown> = { updatedAt: new Date() };
						if (row.newTitle) updateValues.title = row.newTitle;
						if (row.newBggId) updateValues.bggId = row.newBggId;
						if (row.prizeType) updateValues.prizeType = row.prizeType;
						if (row.shelfCategory) updateValues.shelfCategory = row.shelfCategory;

						await tx
							.update(games)
							.set(updateValues)
							.where(eq(games.id, existing.id));

						gameIds.push(existing.id);
						modified++;
						break;
					}

					case 'delete': {
						const [existing] = await tx
							.select({ id: games.id, status: games.status })
							.from(games)
							.where(
								and(
									eq(games.title, row.title),
									eq(games.bggId, row.bggId),
									eq(games.copyNumber, row.copyNumber!)
								)
							);

						if (!existing) {
							throw new Error(`Game not found for delete: "${row.title}" BGG ${row.bggId} copy #${row.copyNumber}`);
						}

						// Retire the game (soft-delete) rather than hard-delete
						await tx
							.update(games)
							.set({ status: 'retired', updatedAt: new Date() })
							.where(eq(games.id, existing.id));

						gameIds.push(existing.id);
						deleted++;
						break;
					}
				}
			}

			return { added, modified, deleted, gameIds };
		});
	},

	/**
	 * Export all games as a CSV string.
	 * Columns: title, BGG_ID, copy_number, status, prize_type, shelf_category
	 */
	async exportGames(): Promise<string> {
		const allGames = await db
			.select({
				title: games.title,
				bggId: games.bggId,
				copyNumber: games.copyNumber,
				status: games.status,
				prizeType: games.prizeType,
				shelfCategory: games.shelfCategory
			})
			.from(games)
			.orderBy(asc(games.title), asc(games.copyNumber));

		return Papa.unparse(
			allGames.map((g) => ({
				title: g.title,
				BGG_ID: g.bggId,
				copy_number: g.copyNumber,
				status: g.status,
				prize_type: g.prizeType,
				shelf_category: g.shelfCategory
			}))
		);
	}
};
