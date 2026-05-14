import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateCsvRows } from '$lib/server/validation.js';

/**
 * Feature: attendee-tracking-swaps-categories, Property 10: CSV shelf category round-trip
 *
 * For any valid game with a shelf category value, exporting to CSV and re-importing
 * SHALL preserve the shelf category. For any CSV row with an invalid shelf category
 * value, the import SHALL be rejected with an error identifying the row.
 *
 * **Validates: Requirements 4.10, 4.11, 4.12**
 */
describe('Property 10: CSV shelf category round-trip', () => {
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validShelfCategory = fc.constantFrom('family', 'small', 'standard');
	const validPrizeType = fc.constantFrom('standard', 'play_and_win', 'play_and_take');

	it('preserves valid shelf categories through validateCsvRows', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validShelfCategory,
				(title, bggId, shelfCategory) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						shelf_category: shelfCategory
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].shelfCategory).toBe(shelfCategory);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects invalid shelf category values with row-identifying error', () => {
		const invalidShelfCategory = fc.string({ minLength: 1 })
			.filter((s) => !['family', 'small', 'standard', ''].includes(s.trim().toLowerCase()));

		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				invalidShelfCategory,
				(title, bggId, shelfCategory) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						shelf_category: shelfCategory
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.length).toBeGreaterThan(0);
					// Error should identify the row (row 1)
					expect(result.errors.some((e) => e.row === 1 && e.message.toLowerCase().includes('shelf category'))).toBe(true);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('defaults shelf category to standard when missing or empty for add actions', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				fc.constantFrom('', undefined),
				(title, bggId, shelfCategoryValue) => {
					const row: Record<string, string> = {
						title,
						bgg_id: String(bggId),
						copy_count: '1'
					};
					if (shelfCategoryValue !== undefined) {
						row.shelf_category = shelfCategoryValue;
					}
					const result = validateCsvRows([row]);
					expect(result.valid).toBe(true);
					expect(result.rows[0].shelfCategory).toBe('standard');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('accepts shelfCategory as an alternative column key', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validShelfCategory,
				(title, bggId, shelfCategory) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						shelfCategory
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].shelfCategory).toBe(shelfCategory);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('identifies the correct row number in error for invalid shelf category in multi-row CSV', () => {
		const invalidShelfCategory = fc.string({ minLength: 1 })
			.filter((s) => !['family', 'small', 'standard', ''].includes(s.trim().toLowerCase()));

		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 5 }),
				invalidShelfCategory,
				(rowCount, badCategory) => {
					// Create valid rows, then corrupt one
					const rows = Array.from({ length: rowCount }, () => ({
						title: 'Valid Game',
						bgg_id: '100',
						copy_count: '1',
						shelf_category: 'family'
					}));
					// Corrupt the last row
					rows[rowCount - 1].shelf_category = badCategory;
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.some((e) => e.row === rowCount)).toBe(true);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});
});

/**
 * Feature: attendee-tracking-swaps-categories, Property 11: CSV prizeType/gameType backward compatibility
 *
 * For any valid CSV import, the system SHALL accept both prizeType and gameType
 * as column headers and produce the same result. The exported CSV SHALL use
 * prizeType as the header.
 *
 * **Validates: Requirements 5.5**
 */
describe('Property 11: CSV prizeType/gameType backward compatibility', () => {
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validPrizeType = fc.constantFrom('standard', 'play_and_win', 'play_and_take');

	it('produces same result with prize_type header as with game_type header', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validPrizeType,
				(title, bggId, prizeType) => {
					const rowWithPrizeType = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						prize_type: prizeType
					}];
					const rowWithGameType = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						game_type: prizeType
					}];

					const resultPrize = validateCsvRows(rowWithPrizeType);
					const resultGame = validateCsvRows(rowWithGameType);

					expect(resultPrize.valid).toBe(true);
					expect(resultGame.valid).toBe(true);
					expect(resultPrize.rows[0].prizeType).toBe(prizeType);
					expect(resultGame.rows[0].prizeType).toBe(prizeType);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('accepts prizeType as a column key (camelCase variant)', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validPrizeType,
				(title, bggId, prizeType) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						prizeType
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].prizeType).toBe(prizeType);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('accepts gameType as a legacy column key (camelCase variant)', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validPrizeType,
				(title, bggId, prizeType) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						gameType: prizeType
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].prizeType).toBe(prizeType);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('defaults prizeType to standard when neither prize_type nor game_type is provided', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				(title, bggId) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1'
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].prizeType).toBe('standard');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('prize_type takes precedence when both prize_type and game_type are present', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validPrizeType,
				validPrizeType,
				(title, bggId, prizeTypeVal, gameTypeVal) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						prize_type: prizeTypeVal,
						game_type: gameTypeVal
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					// prize_type should take precedence since it's checked first
					expect(result.rows[0].prizeType).toBe(prizeTypeVal);
				}
			),
			{ numRuns: 100 }
		);
	});
});
