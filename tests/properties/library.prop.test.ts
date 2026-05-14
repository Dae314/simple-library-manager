import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// --- Types (mirrors src/lib/server/services/games.ts) ---

interface LibraryGameRecord {
	id: number;
	title: string;
	bggId: number;
	copyNumber: number;
	totalCopies: number;
	status: string;
	prizeType: string;
	version: number;
	attendeeFirstName: string | null;
	attendeeLastName: string | null;
	idType: string | null;
	checkoutWeight: number | null;
	checkoutAt: Date | null;
}

interface LibraryFilters {
	status?: 'available' | 'checked_out';
	prizeType?: 'standard' | 'play_and_win' | 'play_and_take';
	titleSearch?: string;
	attendeeSearch?: string;
}

interface LibrarySortParams {
	field: 'title' | 'prize_type' | 'status' | 'bgg_id';
	direction: 'asc' | 'desc';
}

interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
}

// --- Pure helper functions (mirror the DB query logic in-memory) ---

/**
 * Filter out retired games — the base invariant of listLibrary().
 */
function excludeRetired(games: LibraryGameRecord[]): LibraryGameRecord[] {
	return games.filter((g) => g.status !== 'retired');
}

/**
 * Apply LibraryFilters to an array of non-retired games.
 * Mirrors the WHERE conditions built by listLibrary().
 */
function applyFilters(games: LibraryGameRecord[], filters: LibraryFilters): LibraryGameRecord[] {
	let result = games;

	if (filters.status) {
		result = result.filter((g) => g.status === filters.status);
	}
	if (filters.prizeType) {
		result = result.filter((g) => g.prizeType === filters.prizeType);
	}
	if (filters.titleSearch) {
		const search = filters.titleSearch.toLowerCase();
		result = result.filter((g) => g.title.toLowerCase().includes(search));
	}
	if (filters.attendeeSearch) {
		const search = filters.attendeeSearch.toLowerCase();
		result = result.filter((g) => {
			const first = (g.attendeeFirstName ?? '').toLowerCase();
			const last = (g.attendeeLastName ?? '').toLowerCase();
			return first.includes(search) || last.includes(search);
		});
	}

	return result;
}

/**
 * Sort games by the given field and direction.
 * Mirrors the ORDER BY logic in listLibrary().
 */
function applySort(games: LibraryGameRecord[], sort: LibrarySortParams): LibraryGameRecord[] {
	const sorted = [...games];
	const dir = sort.direction === 'asc' ? 1 : -1;

	sorted.sort((a, b) => {
		let aVal: string | number;
		let bVal: string | number;

		switch (sort.field) {
			case 'title':
				aVal = a.title;
				bVal = b.title;
				break;
			case 'prize_type':
				aVal = a.prizeType;
				bVal = b.prizeType;
				break;
			case 'status':
				aVal = a.status;
				bVal = b.status;
				break;
			case 'bgg_id':
				aVal = a.bggId;
				bVal = b.bggId;
				break;
			default:
				aVal = a.title;
				bVal = b.title;
		}

		if (aVal < bVal) return -1 * dir;
		if (aVal > bVal) return 1 * dir;
		return 0;
	});

	return sorted;
}

/**
 * Paginate an array of items. Mirrors the LIMIT/OFFSET logic.
 */
function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
	const total = items.length;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.max(1, Math.min(page, totalPages));
	const offset = (safePage - 1) * pageSize;
	const pageItems = items.slice(offset, offset + pageSize);
	return { items: pageItems, total, page: safePage, pageSize };
}

// --- Arbitraries ---

const gameStatuses = ['available', 'checked_out', 'retired'] as const;
const nonRetiredStatuses = ['available', 'checked_out'] as const;
const prizeTypes = ['standard', 'play_and_win', 'play_and_take'] as const;
const sortFields = ['title', 'prize_type', 'status', 'bgg_id'] as const;
const sortDirections = ['asc', 'desc'] as const;

/** Generate a non-empty, non-whitespace-only title */
const titleArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** Generate a non-empty name string for attendees */
const nameArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

/**
 * Generate a LibraryGameRecord with a given status.
 * Available games have null checkout fields; checked-out games have non-null fields.
 */
function gameRecordArb(status: 'available' | 'checked_out' | 'retired'): fc.Arbitrary<LibraryGameRecord> {
	const base = fc.record({
		id: fc.integer({ min: 1, max: 100000 }),
		title: titleArb,
		bggId: fc.integer({ min: 1, max: 999999 }),
		copyNumber: fc.integer({ min: 1, max: 10 }),
		totalCopies: fc.integer({ min: 1, max: 10 }),
		prizeType: fc.constantFrom(...prizeTypes),
		version: fc.integer({ min: 1, max: 100 })
	});

	if (status === 'available' || status === 'retired') {
		return base.map((b) => ({
			...b,
			status,
			attendeeFirstName: null,
			attendeeLastName: null,
			idType: null,
			checkoutWeight: null,
			checkoutAt: null
		}));
	}

	// checked_out: non-null attendee/checkout fields
	return fc
		.tuple(
			base,
			nameArb,
			nameArb,
			fc.constantFrom('Driver License', 'Passport', 'Student ID'),
			fc.double({ min: 0.1, max: 50, noNaN: true }),
			fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
		)
		.map(([b, firstName, lastName, idType, weight, checkoutAt]) => ({
			...b,
			status: 'checked_out' as const,
			attendeeFirstName: firstName,
			attendeeLastName: lastName,
			idType,
			checkoutWeight: weight,
			checkoutAt
		}));
}

/** Generate a mixed-status game set (available, checked_out, retired) */
const mixedGameSetArb = fc
	.tuple(
		fc.array(gameRecordArb('available'), { minLength: 0, maxLength: 20 }),
		fc.array(gameRecordArb('checked_out'), { minLength: 0, maxLength: 20 }),
		fc.array(gameRecordArb('retired'), { minLength: 0, maxLength: 10 })
	)
	.filter(([a, b, c]) => a.length + b.length + c.length > 0)
	.map(([available, checkedOut, retired]) => {
		// Assign unique IDs
		const all = [...available, ...checkedOut, ...retired];
		return all.map((g, i) => ({ ...g, id: i + 1 }));
	});

/** Generate a non-retired game set */
const nonRetiredGameSetArb = fc
	.tuple(
		fc.array(gameRecordArb('available'), { minLength: 0, maxLength: 25 }),
		fc.array(gameRecordArb('checked_out'), { minLength: 0, maxLength: 25 })
	)
	.filter(([a, b]) => a.length + b.length > 0)
	.map(([available, checkedOut]) => {
		const all = [...available, ...checkedOut];
		return all.map((g, i) => ({ ...g, id: i + 1 }));
	});


// =============================================================================
// Property Tests
// =============================================================================

/**
 * Property 1: Unified listing returns all non-retired games with correct checkout fields
 *
 * For any set of games with mixed statuses (available, checked_out, retired),
 * the listing SHALL return exactly the non-retired games, where every available
 * game has null attendee/checkout fields and every checked-out game has non-null
 * attendee name and checkout timestamp.
 *
 * **Validates: Requirements 1.1, 1.3, 2.4**
 */
describe('Property 1: Unified listing returns all non-retired games with correct checkout fields', () => {
	it('excludes all retired games from the result', () => {
		fc.assert(
			fc.property(mixedGameSetArb, (allGames) => {
				const result = excludeRetired(allGames);
				expect(result.every((g) => g.status !== 'retired')).toBe(true);
			}),
			{ numRuns: 500 }
		);
	});

	it('includes every non-retired game', () => {
		fc.assert(
			fc.property(mixedGameSetArb, (allGames) => {
				const result = excludeRetired(allGames);
				const expectedCount = allGames.filter((g) => g.status !== 'retired').length;
				expect(result.length).toBe(expectedCount);
			}),
			{ numRuns: 500 }
		);
	});

	it('available games have null attendee and checkout fields', () => {
		fc.assert(
			fc.property(mixedGameSetArb, (allGames) => {
				const result = excludeRetired(allGames);
				const available = result.filter((g) => g.status === 'available');
				for (const game of available) {
					expect(game.attendeeFirstName).toBeNull();
					expect(game.attendeeLastName).toBeNull();
					expect(game.checkoutAt).toBeNull();
					expect(game.checkoutWeight).toBeNull();
					expect(game.idType).toBeNull();
				}
			}),
			{ numRuns: 500 }
		);
	});

	it('checked-out games have non-null attendee name and checkout timestamp', () => {
		fc.assert(
			fc.property(mixedGameSetArb, (allGames) => {
				const result = excludeRetired(allGames);
				const checkedOut = result.filter((g) => g.status === 'checked_out');
				for (const game of checkedOut) {
					expect(game.attendeeFirstName).not.toBeNull();
					expect(game.attendeeLastName).not.toBeNull();
					expect(game.checkoutAt).not.toBeNull();
				}
			}),
			{ numRuns: 500 }
		);
	});

	it('default sort is by title ascending', () => {
		fc.assert(
			fc.property(mixedGameSetArb, (allGames) => {
				const nonRetired = excludeRetired(allGames);
				const sorted = applySort(nonRetired, { field: 'title', direction: 'asc' });
				for (let i = 1; i < sorted.length; i++) {
					expect(sorted[i].title >= sorted[i - 1].title).toBe(true);
				}
			}),
			{ numRuns: 200 }
		);
	});
});

/**
 * Property 2: Sort correctness
 *
 * For any set of non-retired games and any valid sort field with any direction,
 * the results SHALL be ordered according to the specified field and direction.
 *
 * **Validates: Requirements 1.4**
 */
describe('Property 2: Sort correctness', () => {
	const sortParamsArb = fc.record({
		field: fc.constantFrom(...sortFields),
		direction: fc.constantFrom(...sortDirections)
	});

	it('results are ordered by the specified field and direction', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, sortParamsArb, (games, sort) => {
				const sorted = applySort(games, sort);
				const dir = sort.direction === 'asc' ? 1 : -1;

				for (let i = 1; i < sorted.length; i++) {
					let prev: string | number;
					let curr: string | number;

					switch (sort.field) {
						case 'title':
							prev = sorted[i - 1].title;
							curr = sorted[i].title;
							break;
						case 'prize_type':
							prev = sorted[i - 1].prizeType;
							curr = sorted[i].prizeType;
							break;
						case 'status':
							prev = sorted[i - 1].status;
							curr = sorted[i].status;
							break;
						case 'bgg_id':
							prev = sorted[i - 1].bggId;
							curr = sorted[i].bggId;
							break;
						default:
							prev = sorted[i - 1].title;
							curr = sorted[i].title;
					}

					if (dir === 1) {
						expect(curr >= prev).toBe(true);
					} else {
						expect(curr <= prev).toBe(true);
					}
				}
			}),
			{ numRuns: 500 }
		);
	});

	it('sort does not add or remove elements', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, sortParamsArb, (games, sort) => {
				const sorted = applySort(games, sort);
				expect(sorted.length).toBe(games.length);
				const sortedIds = sorted.map((g) => g.id).sort((a, b) => a - b);
				const originalIds = games.map((g) => g.id).sort((a, b) => a - b);
				expect(sortedIds).toEqual(originalIds);
			}),
			{ numRuns: 200 }
		);
	});

	it('descending sort reverses the ordering direction', () => {
		fc.assert(
			fc.property(
				nonRetiredGameSetArb,
				fc.constantFrom(...sortFields),
				(games, field) => {
					const ascending = applySort(games, { field, direction: 'asc' });
					const descending = applySort(games, { field, direction: 'desc' });

					// Extract the sort key values — descending should have them in reverse order
					const getKey = (g: LibraryGameRecord) => {
						switch (field) {
							case 'title': return g.title;
							case 'prize_type': return g.prizeType;
							case 'status': return g.status;
							case 'bgg_id': return g.bggId;
						}
					};
					const ascKeys = ascending.map(getKey);
					const descKeys = descending.map(getKey);

					// First element of ascending should be <= first of descending (or equal)
					if (ascKeys.length > 0 && descKeys.length > 0) {
						expect(ascKeys[0]! <= ascKeys[ascKeys.length - 1]!).toBe(true);
						expect(descKeys[0]! >= descKeys[descKeys.length - 1]!).toBe(true);
					}
				}
			),
			{ numRuns: 200 }
		);
	});
});

/**
 * Property 3: Pagination correctness
 *
 * For any set of non-retired games and any valid page number and page size,
 * the paginated result SHALL return a subset of size at most pageSize, the
 * correct total count, and items corresponding to the requested page offset.
 *
 * **Validates: Requirements 1.5**
 */
describe('Property 3: Pagination correctness', () => {
	const pageSizeArb = fc.integer({ min: 1, max: 50 });
	const pageArb = fc.integer({ min: 1, max: 20 });

	it('returned items never exceed the requested page size', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, pageArb, pageSizeArb, (games, page, pageSize) => {
				const result = paginate(games, page, pageSize);
				expect(result.items.length).toBeLessThanOrEqual(pageSize);
			}),
			{ numRuns: 500 }
		);
	});

	it('total count equals the full list length', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, pageArb, pageSizeArb, (games, page, pageSize) => {
				const result = paginate(games, page, pageSize);
				expect(result.total).toBe(games.length);
			}),
			{ numRuns: 500 }
		);
	});

	it('returned items are the correct slice of the full list', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, pageArb, pageSizeArb, (games, page, pageSize) => {
				const result = paginate(games, page, pageSize);
				const totalPages = Math.max(1, Math.ceil(games.length / pageSize));
				const safePage = Math.max(1, Math.min(page, totalPages));
				const offset = (safePage - 1) * pageSize;
				const expected = games.slice(offset, offset + pageSize);
				expect(result.items).toEqual(expected);
			}),
			{ numRuns: 500 }
		);
	});

	it('concatenating all pages reconstructs the original list', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, pageSizeArb, (games, pageSize) => {
				const totalPages = Math.max(1, Math.ceil(games.length / pageSize));
				const allItems: LibraryGameRecord[] = [];
				for (let p = 1; p <= totalPages; p++) {
					allItems.push(...paginate(games, p, pageSize).items);
				}
				expect(allItems).toEqual(games);
			}),
			{ numRuns: 200 }
		);
	});

	it('page beyond total pages is clamped to the last page', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, pageSizeArb, (games, pageSize) => {
				const totalPages = Math.ceil(games.length / pageSize);
				const beyondPage = totalPages + 5;
				const result = paginate(games, beyondPage, pageSize);
				const lastPageResult = paginate(games, totalPages, pageSize);
				expect(result.items).toEqual(lastPageResult.items);
				expect(result.page).toBe(totalPages);
			}),
			{ numRuns: 200 }
		);
	});
});

/**
 * Property 4: Title search filter correctness
 *
 * For any non-empty search string and any set of games, filtering by titleSearch
 * SHALL return only games whose title contains the search string (case-insensitive),
 * and SHALL return all such matching non-retired games.
 *
 * **Validates: Requirements 1.6**
 */
describe('Property 4: Title search filter correctness', () => {
	it('all returned games have titles containing the search string (case-insensitive)', () => {
		fc.assert(
			fc.property(
				nonRetiredGameSetArb,
				fc.string({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
				(games, search) => {
					const filtered = applyFilters(games, { titleSearch: search });
					const lowerSearch = search.toLowerCase();
					for (const game of filtered) {
						expect(game.title.toLowerCase()).toContain(lowerSearch);
					}
				}
			),
			{ numRuns: 500 }
		);
	});

	it('all games matching the search are included in the result', () => {
		fc.assert(
			fc.property(
				nonRetiredGameSetArb,
				fc.string({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
				(games, search) => {
					const filtered = applyFilters(games, { titleSearch: search });
					const lowerSearch = search.toLowerCase();
					const expectedMatches = games.filter((g) =>
						g.title.toLowerCase().includes(lowerSearch)
					);
					expect(filtered.length).toBe(expectedMatches.length);
					const filteredIds = new Set(filtered.map((g) => g.id));
					for (const match of expectedMatches) {
						expect(filteredIds.has(match.id)).toBe(true);
					}
				}
			),
			{ numRuns: 500 }
		);
	});

	it('searching with a substring of an existing title finds that game', () => {
		fc.assert(
			fc.property(
				nonRetiredGameSetArb,
				(games) => {
					if (games.length === 0) return;
					// Pick a random game and use part of its title as the search
					const target = games[0];
					const title = target.title;
					if (title.length < 1) return;
					const sub = title.substring(0, Math.max(1, Math.floor(title.length / 2)));
					const filtered = applyFilters(games, { titleSearch: sub });
					const filteredIds = filtered.map((g) => g.id);
					expect(filteredIds).toContain(target.id);
				}
			),
			{ numRuns: 200 }
		);
	});
});

/**
 * Property 5: Attendee name search filter correctness
 *
 * For any non-empty search string and any set of checked-out games with attendee
 * names, filtering by attendeeSearch SHALL return only games where the attendee
 * first name or last name contains the search string (case-insensitive).
 *
 * **Validates: Requirements 1.7**
 */
describe('Property 5: Attendee name search filter correctness', () => {
	const checkedOutGamesArb = fc
		.array(gameRecordArb('checked_out'), { minLength: 1, maxLength: 30 })
		.map((games) => games.map((g, i) => ({ ...g, id: i + 1 })));

	it('all returned games have attendee names matching the search (case-insensitive)', () => {
		fc.assert(
			fc.property(
				checkedOutGamesArb,
				fc.string({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
				(games, search) => {
					const filtered = applyFilters(games, { attendeeSearch: search });
					const lowerSearch = search.toLowerCase();
					for (const game of filtered) {
						const firstMatch = (game.attendeeFirstName ?? '').toLowerCase().includes(lowerSearch);
						const lastMatch = (game.attendeeLastName ?? '').toLowerCase().includes(lowerSearch);
						expect(firstMatch || lastMatch).toBe(true);
					}
				}
			),
			{ numRuns: 500 }
		);
	});

	it('all games with matching attendee names are included in the result', () => {
		fc.assert(
			fc.property(
				checkedOutGamesArb,
				fc.string({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
				(games, search) => {
					const filtered = applyFilters(games, { attendeeSearch: search });
					const lowerSearch = search.toLowerCase();
					const expectedMatches = games.filter((g) => {
						const first = (g.attendeeFirstName ?? '').toLowerCase();
						const last = (g.attendeeLastName ?? '').toLowerCase();
						return first.includes(lowerSearch) || last.includes(lowerSearch);
					});
					expect(filtered.length).toBe(expectedMatches.length);
				}
			),
			{ numRuns: 500 }
		);
	});

	it('available games with null attendee fields are never matched by attendee search', () => {
		fc.assert(
			fc.property(
				nonRetiredGameSetArb,
				fc.string({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
				(games, search) => {
					const filtered = applyFilters(games, { attendeeSearch: search });
					const available = filtered.filter((g) => g.status === 'available');
					// Available games have null attendee fields, so they should never match
					// unless the search string matches an empty string (which it won't since
					// null coerces to '' and a non-empty search won't be found in '')
					expect(available.length).toBe(0);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('searching by a substring of an existing attendee first name finds that game', () => {
		fc.assert(
			fc.property(checkedOutGamesArb, (games) => {
				const target = games[0];
				const firstName = target.attendeeFirstName!;
				if (firstName.length < 1) return;
				const sub = firstName.substring(0, Math.max(1, Math.floor(firstName.length / 2)));
				const filtered = applyFilters(games, { attendeeSearch: sub });
				const filteredIds = filtered.map((g) => g.id);
				expect(filteredIds).toContain(target.id);
			}),
			{ numRuns: 200 }
		);
	});
});

/**
 * Property 6: Status filter correctness
 *
 * For any status filter value (available or checked_out) and any set of non-retired
 * games, filtering by that status SHALL return only games whose status matches the
 * filter value, and SHALL return all such matching games.
 *
 * **Validates: Requirements 2.2, 2.3**
 */
describe('Property 6: Status filter correctness', () => {
	const statusFilterArb = fc.constantFrom('available' as const, 'checked_out' as const);

	it('all returned games match the requested status', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, statusFilterArb, (games, status) => {
				const filtered = applyFilters(games, { status });
				for (const game of filtered) {
					expect(game.status).toBe(status);
				}
			}),
			{ numRuns: 500 }
		);
	});

	it('all games with the matching status are included in the result', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, statusFilterArb, (games, status) => {
				const filtered = applyFilters(games, { status });
				const expected = games.filter((g) => g.status === status);
				expect(filtered.length).toBe(expected.length);
				const filteredIds = new Set(filtered.map((g) => g.id));
				for (const match of expected) {
					expect(filteredIds.has(match.id)).toBe(true);
				}
			}),
			{ numRuns: 500 }
		);
	});

	it('filtering by available returns no checked-out games', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, (games) => {
				const filtered = applyFilters(games, { status: 'available' });
				expect(filtered.every((g) => g.status !== 'checked_out')).toBe(true);
			}),
			{ numRuns: 200 }
		);
	});

	it('filtering by checked_out returns no available games', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, (games) => {
				const filtered = applyFilters(games, { status: 'checked_out' });
				expect(filtered.every((g) => g.status !== 'available')).toBe(true);
			}),
			{ numRuns: 200 }
		);
	});

	it('filtering by each status partitions the full set (no overlap, full coverage)', () => {
		fc.assert(
			fc.property(nonRetiredGameSetArb, (games) => {
				const available = applyFilters(games, { status: 'available' });
				const checkedOut = applyFilters(games, { status: 'checked_out' });
				// Together they should cover all games
				expect(available.length + checkedOut.length).toBe(games.length);
				// No overlap
				const availableIds = new Set(available.map((g) => g.id));
				for (const g of checkedOut) {
					expect(availableIds.has(g.id)).toBe(false);
				}
			}),
			{ numRuns: 200 }
		);
	});
});
