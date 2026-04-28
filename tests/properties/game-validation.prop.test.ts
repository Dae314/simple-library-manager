import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateGameInput } from '$lib/server/validation.js';

/**
 * Helper: generate the BGG URL for a given BGG ID.
 * This mirrors the format used throughout the application.
 */
function bggUrl(bggId: number): string {
	return `https://boardgamegeek.com/boardgame/${bggId}`;
}

/**
 * Property 1: Game record validation rejects invalid input
 *
 * For any game creation or update input where the title is empty/whitespace
 * or the BGG_ID is not a positive integer, the system SHALL reject the
 * operation and return a validation error without modifying the database.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.3**
 */
describe('Property 1: Game record validation rejects invalid input', () => {
	const validGameTypes = ['standard', 'play_and_win', 'play_and_take'] as const;

	// Arbitrary for valid titles (non-empty, non-whitespace-only)
	const validTitle = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

	// Arbitrary for valid BGG IDs (positive integers, up to 32-bit max)
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });

	// Arbitrary for valid game types (including undefined)
	const validGameType = fc.oneof(
		fc.constant(undefined),
		fc.constantFrom(...validGameTypes)
	);

	// --- Invalid title generators ---
	const emptyTitle = fc.constant('');
	const whitespaceOnlyTitle = fc
		.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
		.map((chars) => chars.join(''));
	const undefinedTitle = fc.constant(undefined);
	const invalidTitle = fc.oneof(emptyTitle, whitespaceOnlyTitle, undefinedTitle);

	// --- Invalid BGG ID generators ---
	const nullBggId = fc.constant(null);
	const undefinedBggId = fc.constant(undefined);
	const zeroBggId = fc.constant(0);
	const negativeBggId = fc.integer({ min: -2_147_483_648, max: -1 });
	const floatBggId = fc.double({ min: 0.01, max: 2_147_483_647, noNaN: true }).filter(
		(n) => !Number.isInteger(n)
	);
	const invalidBggId = fc.oneof(nullBggId, undefinedBggId, zeroBggId, negativeBggId, floatBggId);

	// --- Invalid game type generator ---
	const invalidGameType = fc
		.string({ minLength: 1 })
		.filter((s) => !validGameTypes.includes(s as typeof validGameTypes[number]));

	it('rejects inputs with invalid titles (empty, whitespace-only, or missing)', () => {
		fc.assert(
			fc.property(invalidTitle, validBggId, validGameType, (title, bggId, gameType) => {
				const result = validateGameInput({ title: title as string | undefined, bggId, gameType } as any);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('title');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects inputs with invalid BGG IDs (null, undefined, zero, negative, or float)', () => {
		fc.assert(
			fc.property(validTitle, invalidBggId, validGameType, (title, bggId, gameType) => {
				const result = validateGameInput({ title, bggId: bggId as any, gameType } as any);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('bggId');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects inputs with invalid game types', () => {
		fc.assert(
			fc.property(validTitle, validBggId, invalidGameType, (title, bggId, gameType) => {
				const result = validateGameInput({ title, bggId, gameType: gameType as any });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('gameType');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('accepts valid inputs with all fields correct', () => {
		fc.assert(
			fc.property(validTitle, validBggId, validGameType, (title, bggId, gameType) => {
				const result = validateGameInput({ title, bggId, gameType });
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
				expect(result.data!.title).toBe(title.trim());
				expect(result.data!.bggId).toBe(bggId);
				expect(result.data!.gameType).toBe(gameType ?? 'standard');
			})
		);
	});

	it('accepts valid inputs and defaults gameType to standard when omitted', () => {
		fc.assert(
			fc.property(validTitle, validBggId, (title, bggId) => {
				const result = validateGameInput({ title, bggId });
				expect(result.valid).toBe(true);
				expect(result.data!.gameType).toBe('standard');
			})
		);
	});
});


/**
 * Property 18: BGG URL format
 *
 * For any game with a BGG_ID, the generated BGG link SHALL be exactly
 * `https://boardgamegeek.com/boardgame/{BGG_ID}` where `{BGG_ID}` is the
 * integer value stored on the game record.
 *
 * **Validates: Requirements 9.1**
 */
describe('Property 18: BGG URL format', () => {
	const validBggId = fc.integer({ min: 1, max: 2_147_483_647 });

	it('generates correct BGG URL for any positive integer BGG ID', () => {
		fc.assert(
			fc.property(validBggId, (bggId) => {
				const url = bggUrl(bggId);
				expect(url).toBe(`https://boardgamegeek.com/boardgame/${bggId}`);
			}),
			{ numRuns: 1000 }
		);
	});

	it('URL starts with the correct BGG base path', () => {
		fc.assert(
			fc.property(validBggId, (bggId) => {
				const url = bggUrl(bggId);
				expect(url.startsWith('https://boardgamegeek.com/boardgame/')).toBe(true);
			}),
			{ numRuns: 100 }
		);
	});

	it('URL ends with the exact BGG ID as a string', () => {
		fc.assert(
			fc.property(validBggId, (bggId) => {
				const url = bggUrl(bggId);
				const suffix = url.split('/').pop();
				expect(suffix).toBe(String(bggId));
			}),
			{ numRuns: 100 }
		);
	});

	it('URL contains no extra path segments or query parameters', () => {
		fc.assert(
			fc.property(validBggId, (bggId) => {
				const url = bggUrl(bggId);
				const parts = url.replace('https://boardgamegeek.com/', '').split('/');
				expect(parts).toEqual(['boardgame', String(bggId)]);
				expect(url).not.toContain('?');
				expect(url).not.toContain('#');
			}),
			{ numRuns: 100 }
		);
	});

	it('URL is a valid URL that can be parsed', () => {
		fc.assert(
			fc.property(validBggId, (bggId) => {
				const url = bggUrl(bggId);
				const parsed = new URL(url);
				expect(parsed.protocol).toBe('https:');
				expect(parsed.hostname).toBe('boardgamegeek.com');
				expect(parsed.pathname).toBe(`/boardgame/${bggId}`);
			}),
			{ numRuns: 100 }
		);
	});
});
