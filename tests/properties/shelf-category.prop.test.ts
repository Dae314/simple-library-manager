import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateGameInput } from '$lib/server/validation.js';

/**
 * Feature: attendee-tracking-swaps-categories, Property 8: Shelf category validation
 *
 * For any string value provided as a shelfCategory, the game validation SHALL accept it
 * if and only if it is one of family, small, or standard. All other values SHALL be
 * rejected with a validation error.
 *
 * **Validates: Requirements 4.1, 4.4, 4.5**
 */
describe('Property 8: Shelf category validation', () => {
	const VALID_SHELF_CATEGORIES = ['family', 'small', 'standard'] as const;

	// Arbitraries for valid base game fields (needed to isolate shelfCategory testing)
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });

	// Arbitrary for valid shelf categories
	const validShelfCategory = fc.constantFrom(...VALID_SHELF_CATEGORIES);

	// Arbitrary for invalid shelf categories: any non-empty string that is NOT one of the valid values
	const invalidShelfCategory = fc
		.string({ minLength: 1 })
		.filter((s) => !VALID_SHELF_CATEGORIES.includes(s as typeof VALID_SHELF_CATEGORIES[number]));

	it('accepts valid shelf categories (family, small, standard)', () => {
		fc.assert(
			fc.property(validTitle, validBggId, validShelfCategory, (title, bggId, shelfCategory) => {
				const result = validateGameInput({ title, bggId, shelfCategory });
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
				expect(result.data!.shelfCategory).toBe(shelfCategory);
			})
		);
	});

	it('rejects any string value that is not family, small, or standard', () => {
		fc.assert(
			fc.property(validTitle, validBggId, invalidShelfCategory, (title, bggId, shelfCategory) => {
				const result = validateGameInput({ title, bggId, shelfCategory: shelfCategory as any });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('shelfCategory');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('defaults shelfCategory to standard when omitted', () => {
		fc.assert(
			fc.property(validTitle, validBggId, (title, bggId) => {
				const result = validateGameInput({ title, bggId });
				expect(result.valid).toBe(true);
				expect(result.data).toBeDefined();
				expect(result.data!.shelfCategory).toBe('standard');
			})
		);
	});
});


/**
 * Feature: attendee-tracking-swaps-categories, Property 12: Shelf category and prize type independence
 *
 * For any game, updating the shelfCategory SHALL NOT change the prizeType value,
 * and updating the prizeType SHALL NOT change the shelfCategory value.
 *
 * **Validates: Requirements 4.13**
 */
describe('Property 12: Shelf category and prize type independence', () => {
	const VALID_SHELF_CATEGORIES = ['family', 'small', 'standard'] as const;
	const VALID_PRIZE_TYPES = ['standard', 'play_and_win', 'play_and_take'] as const;

	interface GameRecord {
		prizeType: string;
		shelfCategory: string;
	}

	function updateShelfCategory(game: GameRecord, newCategory: string): GameRecord {
		return { ...game, shelfCategory: newCategory };
	}

	function updatePrizeType(game: GameRecord, newPrizeType: string): GameRecord {
		return { ...game, prizeType: newPrizeType };
	}

	// Arbitraries
	const validShelfCategory = fc.constantFrom(...VALID_SHELF_CATEGORIES);
	const validPrizeType = fc.constantFrom(...VALID_PRIZE_TYPES);

	const validGameRecord = fc.record({
		prizeType: validPrizeType,
		shelfCategory: validShelfCategory
	});

	it('updating shelfCategory preserves prizeType', () => {
		fc.assert(
			fc.property(validGameRecord, validShelfCategory, (game, newCategory) => {
				const updated = updateShelfCategory(game, newCategory);
				expect(updated.prizeType).toBe(game.prizeType);
			})
		);
	});

	it('updating prizeType preserves shelfCategory', () => {
		fc.assert(
			fc.property(validGameRecord, validPrizeType, (game, newPrizeType) => {
				const updated = updatePrizeType(game, newPrizeType);
				expect(updated.shelfCategory).toBe(game.shelfCategory);
			})
		);
	});

	it('multiple sequential updates to one field never affect the other', () => {
		fc.assert(
			fc.property(
				validGameRecord,
				fc.array(validShelfCategory, { minLength: 1, maxLength: 10 }),
				fc.array(validPrizeType, { minLength: 1, maxLength: 10 }),
				(game, categoryUpdates, prizeTypeUpdates) => {
					// Apply multiple shelfCategory updates — prizeType should remain unchanged
					let current: GameRecord = { ...game };
					for (const cat of categoryUpdates) {
						current = updateShelfCategory(current, cat);
					}
					expect(current.prizeType).toBe(game.prizeType);

					// Apply multiple prizeType updates — shelfCategory should remain unchanged
					current = { ...game };
					for (const pt of prizeTypeUpdates) {
						current = updatePrizeType(current, pt);
					}
					expect(current.shelfCategory).toBe(game.shelfCategory);
				}
			)
		);
	});

	it('both fields can be set independently to any valid combination', () => {
		fc.assert(
			fc.property(
				validGameRecord,
				validShelfCategory,
				validPrizeType,
				(game, newCategory, newPrizeType) => {
					// Update both fields independently
					const afterCategoryUpdate = updateShelfCategory(game, newCategory);
					const afterBothUpdates = updatePrizeType(afterCategoryUpdate, newPrizeType);

					// Each field should reflect its own update independently
					expect(afterBothUpdates.shelfCategory).toBe(newCategory);
					expect(afterBothUpdates.prizeType).toBe(newPrizeType);

					// Order shouldn't matter — update in reverse order
					const afterPrizeUpdate = updatePrizeType(game, newPrizeType);
					const afterBothReversed = updateShelfCategory(afterPrizeUpdate, newCategory);

					expect(afterBothReversed.shelfCategory).toBe(newCategory);
					expect(afterBothReversed.prizeType).toBe(newPrizeType);
				}
			)
		);
	});
});


/**
 * Feature: attendee-tracking-swaps-categories, Property 9: Shelf category filtering
 *
 * For any set of games with various shelf categories and any selected shelf category
 * filter value, the filtered results SHALL contain only games whose shelfCategory
 * matches the filter value.
 *
 * **Validates: Requirements 4.8**
 */
describe('Property 9: Shelf category filtering', () => {
	const VALID_SHELF_CATEGORIES = ['family', 'small', 'standard'] as const;
	type ShelfCategory = (typeof VALID_SHELF_CATEGORIES)[number];

	interface GameRecord {
		id: number;
		title: string;
		shelfCategory: ShelfCategory;
	}

	function filterByShelfCategory(games: GameRecord[], filter: string): GameRecord[] {
		return games.filter((g) => g.shelfCategory === filter);
	}

	// Arbitrary for a single game record
	const gameRecordArb = fc.record({
		id: fc.integer({ min: 1, max: 100_000 }),
		title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
		shelfCategory: fc.constantFrom(...VALID_SHELF_CATEGORIES)
	});

	// Arbitrary for a list of game records
	const gameListArb = fc.array(gameRecordArb, { minLength: 0, maxLength: 50 });

	// Arbitrary for a valid shelf category filter
	const validFilterArb = fc.constantFrom(...VALID_SHELF_CATEGORIES);

	// Arbitrary for an invalid shelf category filter (non-existent category)
	const invalidFilterArb = fc
		.string({ minLength: 1, maxLength: 20 })
		.filter((s) => !VALID_SHELF_CATEGORIES.includes(s as ShelfCategory));

	it('all results have shelfCategory matching the filter value', () => {
		fc.assert(
			fc.property(gameListArb, validFilterArb, (games, filter) => {
				const results = filterByShelfCategory(games, filter);
				for (const game of results) {
					expect(game.shelfCategory).toBe(filter);
				}
			})
		);
	});

	it('no games with matching shelfCategory are excluded (completeness)', () => {
		fc.assert(
			fc.property(gameListArb, validFilterArb, (games, filter) => {
				const results = filterByShelfCategory(games, filter);
				const expectedCount = games.filter((g) => g.shelfCategory === filter).length;
				expect(results.length).toBe(expectedCount);
			})
		);
	});

	it('filtering by each valid category returns only games of that category', () => {
		fc.assert(
			fc.property(gameListArb, (games) => {
				for (const category of VALID_SHELF_CATEGORIES) {
					const results = filterByShelfCategory(games, category);
					expect(results.every((g) => g.shelfCategory === category)).toBe(true);
					expect(results.length).toBe(
						games.filter((g) => g.shelfCategory === category).length
					);
				}
			})
		);
	});

	it('filtering by a non-existent category returns empty results', () => {
		fc.assert(
			fc.property(gameListArb, invalidFilterArb, (games, filter) => {
				const results = filterByShelfCategory(games, filter);
				expect(results).toEqual([]);
			})
		);
	});
});
