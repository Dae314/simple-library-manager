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
						expect(result.rows[i].action).toBe('add');
						expect(result.rows[i].gameType).toBe('standard');
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

/**
 * Property 21: CSV action column parsing and validation
 *
 * The action column SHALL default to "add" when omitted, accept the three
 * valid values (add, modify, delete), and reject any unknown action string.
 *
 * **Validates: CSV action-based import**
 */
describe('Property 21: CSV action column parsing and validation', () => {
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validCopyNumber = fc.integer({ min: 1, max: 1000 });
	const validGameType = fc.constantFrom('standard', 'play_and_win', 'play_and_take');

	it('defaults action to "add" when the action column is absent', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				(title, bggId) => {
					const rows = [{ title, bgg_id: String(bggId), copy_count: '1' }];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].action).toBe('add');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('accepts all three valid action values (case-insensitive)', () => {
		const actionVariant = fc.constantFrom('add', 'Add', 'ADD', 'modify', 'Modify', 'MODIFY', 'delete', 'Delete', 'DELETE');

		fc.assert(
			fc.property(
				actionVariant,
				validTitle,
				validBggId,
				validCopyNumber,
				(action, title, bggId, copyNumber) => {
					const normalized = action.toLowerCase();
					const row: Record<string, string> = {
						action,
						title,
						bgg_id: String(bggId)
					};

					if (normalized === 'add') {
						row.copy_count = '1';
					} else {
						row.copy_number = String(copyNumber);
					}

					// modify needs at least one change field
					if (normalized === 'modify') {
						row.game_type = 'play_and_win';
					}

					const result = validateCsvRows([row]);
					expect(result.valid).toBe(true);
					expect(result.rows[0].action).toBe(normalized);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects unknown action values', () => {
		const badAction = fc.string({ minLength: 1 })
			.filter((s) => !['add', 'modify', 'delete'].includes(s.trim().toLowerCase()));

		fc.assert(
			fc.property(
				badAction,
				(action) => {
					const rows = [{
						action,
						title: 'Some Game',
						bgg_id: '100',
						copy_count: '1'
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.some((e) => e.message.toLowerCase().includes('action'))).toBe(true);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});
});

/**
 * Property 22: CSV game_type validation
 *
 * The game_type column SHALL accept the three valid game types, default to
 * "standard" for add rows when omitted, and reject any invalid game type string.
 *
 * **Validates: CSV game type export/import**
 */
describe('Property 22: CSV game_type validation', () => {
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validGameType = fc.constantFrom('standard', 'play_and_win', 'play_and_take');

	it('accepts valid game_type values for add rows', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validGameType,
				(title, bggId, gameType) => {
					const rows = [{
						title,
						bgg_id: String(bggId),
						copy_count: '1',
						game_type: gameType
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].gameType).toBe(gameType);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('defaults game_type to "standard" when omitted for add rows', () => {
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
					expect(result.rows[0].gameType).toBe('standard');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects invalid game_type values', () => {
		const badGameType = fc.string({ minLength: 1 })
			.filter((s) => !['standard', 'play_and_win', 'play_and_take', ''].includes(s.trim().toLowerCase()));

		fc.assert(
			fc.property(
				badGameType,
				(gameType) => {
					const rows = [{
						title: 'Some Game',
						bgg_id: '100',
						copy_count: '1',
						game_type: gameType
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.some((e) => e.message.toLowerCase().includes('game type'))).toBe(true);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});
});

/**
 * Property 23: CSV modify action validation
 *
 * Modify rows SHALL require a copy_number to identify the target game and
 * at least one change field (game_type, new_title, or new_bgg_id). Rows
 * missing both requirements are rejected.
 *
 * **Validates: CSV modify action**
 */
describe('Property 23: CSV modify action validation', () => {
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validCopyNumber = fc.integer({ min: 1, max: 1000 });
	const validGameType = fc.constantFrom('standard', 'play_and_win', 'play_and_take');

	it('accepts modify rows with copy_number and a game_type change', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validCopyNumber,
				validGameType,
				(title, bggId, copyNumber, gameType) => {
					const rows = [{
						action: 'modify',
						title,
						bgg_id: String(bggId),
						copy_number: String(copyNumber),
						game_type: gameType
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].action).toBe('modify');
					expect(result.rows[0].copyNumber).toBe(copyNumber);
					expect(result.rows[0].gameType).toBe(gameType);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('accepts modify rows with a new_title change', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validCopyNumber,
				validTitle,
				(title, bggId, copyNumber, newTitle) => {
					const rows = [{
						action: 'modify',
						title,
						bgg_id: String(bggId),
						copy_number: String(copyNumber),
						new_title: newTitle
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].newTitle).toBe(newTitle.trim());
				}
			),
			{ numRuns: 100 }
		);
	});

	it('accepts modify rows with a new_bgg_id change', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validCopyNumber,
				validBggId,
				(title, bggId, copyNumber, newBggId) => {
					const rows = [{
						action: 'modify',
						title,
						bgg_id: String(bggId),
						copy_number: String(copyNumber),
						new_bgg_id: String(newBggId)
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].newBggId).toBe(newBggId);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects modify rows missing copy_number', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validGameType,
				(title, bggId, gameType) => {
					const rows = [{
						action: 'modify',
						title,
						bgg_id: String(bggId),
						game_type: gameType
						// no copy_number
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.some((e) => e.message.toLowerCase().includes('copy number'))).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects modify rows with no change fields', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validCopyNumber,
				(title, bggId, copyNumber) => {
					const rows = [{
						action: 'modify',
						title,
						bgg_id: String(bggId),
						copy_number: String(copyNumber)
						// no game_type, new_title, or new_bgg_id
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.some((e) => e.message.toLowerCase().includes('at least one change'))).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects modify rows with an invalid new_bgg_id', () => {
		const badNewBggId = fc.constantFrom('0', '-1', 'abc', '3.14');

		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validCopyNumber,
				badNewBggId,
				(title, bggId, copyNumber, newBggId) => {
					const rows = [{
						action: 'modify',
						title,
						bgg_id: String(bggId),
						copy_number: String(copyNumber),
						new_bgg_id: newBggId
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.some((e) => e.message.toLowerCase().includes('new bgg id'))).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});

/**
 * Property 24: CSV delete action validation
 *
 * Delete rows SHALL require a copy_number to identify the specific game copy.
 * They do not require copy_count or change fields.
 *
 * **Validates: CSV delete action**
 */
describe('Property 24: CSV delete action validation', () => {
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validCopyNumber = fc.integer({ min: 1, max: 1000 });

	it('accepts delete rows with title, bgg_id, and copy_number', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				validCopyNumber,
				(title, bggId, copyNumber) => {
					const rows = [{
						action: 'delete',
						title,
						bgg_id: String(bggId),
						copy_number: String(copyNumber)
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows[0].action).toBe('delete');
					expect(result.rows[0].copyNumber).toBe(copyNumber);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects delete rows missing copy_number', () => {
		fc.assert(
			fc.property(
				validTitle,
				validBggId,
				(title, bggId) => {
					const rows = [{
						action: 'delete',
						title,
						bgg_id: String(bggId)
						// no copy_number
					}];
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.errors.some((e) => e.message.toLowerCase().includes('copy number'))).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});

/**
 * Property 25: Mixed-action CSV batches
 *
 * A CSV containing a mix of add, modify, and delete rows SHALL validate
 * successfully when all rows are individually valid, and SHALL reject the
 * entire batch when any single row is invalid.
 *
 * **Validates: CSV mixed-action batch integrity**
 */
describe('Property 25: Mixed-action CSV batches', () => {
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });
	const validCopyNumber = fc.integer({ min: 1, max: 1000 });
	const validCopyCount = fc.integer({ min: 1, max: 100 });
	const validGameType = fc.constantFrom('standard', 'play_and_win', 'play_and_take');

	const validAddRow = fc.record({
		action: fc.constant('add'),
		title: validTitle,
		bgg_id: validBggId.map(String),
		copy_count: validCopyCount.map(String),
		game_type: validGameType
	});

	const validModifyRow = fc.record({
		action: fc.constant('modify'),
		title: validTitle,
		bgg_id: validBggId.map(String),
		copy_number: validCopyNumber.map(String),
		game_type: validGameType
	});

	const validDeleteRow = fc.record({
		action: fc.constant('delete'),
		title: validTitle,
		bgg_id: validBggId.map(String),
		copy_number: validCopyNumber.map(String)
	});

	it('accepts a mixed batch of valid add, modify, and delete rows', () => {
		fc.assert(
			fc.property(
				fc.array(fc.oneof(validAddRow, validModifyRow, validDeleteRow), { minLength: 1, maxLength: 10 }),
				(rows) => {
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(true);
					expect(result.rows.length).toBe(rows.length);

					for (let i = 0; i < rows.length; i++) {
						expect(result.rows[i].action).toBe(rows[i].action);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects the entire mixed batch when one row is invalid', () => {
		const validMixedRow = fc.oneof(validAddRow, validModifyRow, validDeleteRow);

		fc.assert(
			fc.property(
				fc.array(validMixedRow, { minLength: 1, maxLength: 5 }),
				fc.integer({ min: 0, max: 4 }),
				(validRows, badIndex) => {
					const idx = badIndex % validRows.length;
					const rows = validRows.map((r) => ({ ...r }));
					// Corrupt one row with an invalid action
					rows[idx] = { ...rows[idx], action: 'invalid_action' };
					const result = validateCsvRows(rows);
					expect(result.valid).toBe(false);
					expect(result.rows).toEqual([]);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('preserves correct action counts in parsed output', () => {
		fc.assert(
			fc.property(
				fc.array(validAddRow, { minLength: 0, maxLength: 3 }),
				fc.array(validModifyRow, { minLength: 0, maxLength: 3 }),
				fc.array(validDeleteRow, { minLength: 0, maxLength: 3 }),
				(adds, modifies, deletes) => {
					const allRows = [...adds, ...modifies, ...deletes];
					if (allRows.length === 0) return; // skip empty

					const result = validateCsvRows(allRows);
					expect(result.valid).toBe(true);

					const parsedAdds = result.rows.filter((r) => r.action === 'add');
					const parsedModifies = result.rows.filter((r) => r.action === 'modify');
					const parsedDeletes = result.rows.filter((r) => r.action === 'delete');

					expect(parsedAdds.length).toBe(adds.length);
					expect(parsedModifies.length).toBe(modifies.length);
					expect(parsedDeletes.length).toBe(deletes.length);
				}
			),
			{ numRuns: 100 }
		);
	});
});
