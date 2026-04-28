import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateCsvRows } from '$lib/server/validation.js';

/**
 * Property 20: CSV validation reports all errors
 *
 * For any CSV file containing rows with missing titles, invalid BGG_IDs,
 * or non-positive copy counts, the system SHALL report every error in the
 * file without importing any records.
 *
 * **Validates: Requirements 19.2, 19.3**
 */
describe('Property 20: CSV validation reports all errors', () => {
	// --- Valid row generators ---
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validCopyCount = fc.integer({ min: 1, max: 100 });

	const validRow = fc.record({
		title: validTitle,
		bgg_id: validBggId.map(String),
		copy_count: validCopyCount.map(String)
	});

	// --- Invalid row generators ---
	const emptyTitle = fc.constantFrom('', '   ', '\t', '\n');
	const invalidBggId = fc.oneof(
		fc.constant('0'),
		fc.constant('-1'),
		fc.constant('abc'),
		fc.constant(''),
		fc.constant('3.14')
	);
	const invalidCopyCount = fc.oneof(
		fc.constant('0'),
		fc.constant('-5'),
		fc.constant('abc'),
		fc.constant('1.5')
	);

	it('reports errors for every row with a missing/empty title', () => {
		fc.assert(
			fc.property(
				fc.array(emptyTitle, { minLength: 1, maxLength: 10 }),
				(titles) => {
					const rows = titles.map((title) => ({
						title,
						bgg_id: '100',
						copy_count: '1'
					}));
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					// Each row should produce at least one error for the title
					const titleErrors = result.errors.filter((e) => e.message.toLowerCase().includes('title'));
					expect(titleErrors.length).toBe(titles.length);
					// No rows should be returned when there are errors
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('reports errors for every row with an invalid BGG ID', () => {
		fc.assert(
			fc.property(
				fc.array(invalidBggId, { minLength: 1, maxLength: 10 }),
				(bggIds) => {
					const rows = bggIds.map((bgg_id) => ({
						title: 'Valid Game',
						bgg_id,
						copy_count: '1'
					}));
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					const bggErrors = result.errors.filter((e) => e.message.toLowerCase().includes('bgg'));
					expect(bggErrors.length).toBe(bggIds.length);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('reports errors for every row with an invalid copy count', () => {
		fc.assert(
			fc.property(
				fc.array(invalidCopyCount, { minLength: 1, maxLength: 10 }),
				(copyCounts) => {
					const rows = copyCounts.map((copy_count) => ({
						title: 'Valid Game',
						bgg_id: '100',
						copy_count
					}));
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					const copyErrors = result.errors.filter((e) => e.message.toLowerCase().includes('copy'));
					expect(copyErrors.length).toBe(copyCounts.length);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('reports multiple errors per row when multiple fields are invalid', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 5 }),
				(count) => {
					const rows = Array.from({ length: count }, () => ({
						title: '',
						bgg_id: 'bad',
						copy_count: '-1'
					}));
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					// Each row should produce 3 errors (title + bgg_id + copy_count)
					expect(result.errors.length).toBe(count * 3);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('correctly identifies error row numbers (1-indexed)', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 10 }),
				(count) => {
					const rows = Array.from({ length: count }, () => ({
						title: '',
						bgg_id: '100',
						copy_count: '1'
					}));
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					// Row numbers should be 1-indexed
					for (let i = 0; i < result.errors.length; i++) {
						expect(result.errors[i].row).toBe(i + 1);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('accepts all-valid rows and returns parsed data', () => {
		fc.assert(
			fc.property(
				fc.array(validRow, { minLength: 1, maxLength: 10 }),
				(rows) => {
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.errors).toEqual([]);
					expect(result.rows.length).toBe(rows.length);

					for (let i = 0; i < rows.length; i++) {
						expect(result.rows[i].title).toBe(rows[i].title.trim());
						expect(result.rows[i].bggId).toBe(Number(rows[i].bgg_id));
						expect(result.rows[i].copyCount).toBe(Number(rows[i].copy_count));
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects entire batch when any single row is invalid (no partial import)', () => {
		fc.assert(
			fc.property(
				fc.array(validRow, { minLength: 1, maxLength: 5 }),
				fc.integer({ min: 0, max: 4 }),
				(validRows, badIndex) => {
					const idx = badIndex % validRows.length;
					const rows = validRows.map((r) => ({ ...r }));
					// Corrupt one row
					rows[idx] = { title: '', bgg_id: 'bad', copy_count: '0' };
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});
});
