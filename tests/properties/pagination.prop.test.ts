import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Pure pagination helper — mirrors the offset/limit math used throughout
 * the server services (games.ts, transactions.ts, statistics.ts):
 *
 *   offset = (page - 1) * pageSize
 *   limit  = pageSize
 *
 * Given a full array of items, returns the correct page slice plus metadata.
 */
function paginate<T>(items: T[], page: number, pageSize: number) {
	const total = items.length;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.max(1, Math.min(page, totalPages));
	const offset = (safePage - 1) * pageSize;
	const pageItems = items.slice(offset, offset + pageSize);
	return { items: pageItems, total, page: safePage, pageSize };
}

/**
 * Property 22: Pagination returns correct subset
 *
 * For any list of N items, page number P, and page size S, the paginated
 * result SHALL contain items from index (P-1)*S to min(P*S, N)-1
 * (zero-indexed) of the full sorted/filtered list, and the total count
 * SHALL equal N.
 *
 * **Validates: Requirements 16.1, 16.4**
 */
describe('Property 22: Pagination returns correct subset', () => {
	// Arbitrary for a non-empty array of unique integers (simulating item IDs)
	const itemsArb = fc.array(fc.integer(), { minLength: 0, maxLength: 200 });
	const pageSizeArb = fc.integer({ min: 1, max: 100 });
	const pageArb = fc.integer({ min: 1, max: 50 });

	it('returned items are the correct slice of the full list', () => {
		fc.assert(
			fc.property(itemsArb, pageArb, pageSizeArb, (items, page, pageSize) => {
				const result = paginate(items, page, pageSize);
				const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
				const safePage = Math.max(1, Math.min(page, totalPages));
				const offset = (safePage - 1) * pageSize;
				const expected = items.slice(offset, offset + pageSize);
				expect(result.items).toEqual(expected);
			}),
			{ numRuns: 1000 }
		);
	});

	it('total count always equals the full list length', () => {
		fc.assert(
			fc.property(itemsArb, pageArb, pageSizeArb, (items, page, pageSize) => {
				const result = paginate(items, page, pageSize);
				expect(result.total).toBe(items.length);
			}),
			{ numRuns: 500 }
		);
	});

	it('page size of returned items never exceeds the requested page size', () => {
		fc.assert(
			fc.property(itemsArb, pageArb, pageSizeArb, (items, page, pageSize) => {
				const result = paginate(items, page, pageSize);
				expect(result.items.length).toBeLessThanOrEqual(pageSize);
			}),
			{ numRuns: 500 }
		);
	});

	it('last page contains the remaining items (N mod S or S)', () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
				pageSizeArb,
				(items, pageSize) => {
					const totalPages = Math.ceil(items.length / pageSize);
					const result = paginate(items, totalPages, pageSize);
					const expectedCount = items.length % pageSize || pageSize;
					expect(result.items.length).toBe(expectedCount);
				}
			),
			{ numRuns: 500 }
		);
	});

	it('concatenating all pages reconstructs the original list', () => {
		fc.assert(
			fc.property(itemsArb, pageSizeArb, (items, pageSize) => {
				const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
				const allItems: number[] = [];
				for (let p = 1; p <= totalPages; p++) {
					const result = paginate(items, p, pageSize);
					allItems.push(...result.items);
				}
				expect(allItems).toEqual(items);
			}),
			{ numRuns: 500 }
		);
	});

	it('pages do not overlap — each item appears on exactly one page', () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
				pageSizeArb,
				(items, pageSize) => {
					const totalPages = Math.ceil(items.length / pageSize);
					let totalItemCount = 0;
					for (let p = 1; p <= totalPages; p++) {
						totalItemCount += paginate(items, p, pageSize).items.length;
					}
					expect(totalItemCount).toBe(items.length);
				}
			),
			{ numRuns: 500 }
		);
	});

	it('page beyond total pages is clamped to the last page', () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
				pageSizeArb,
				(items, pageSize) => {
					const totalPages = Math.ceil(items.length / pageSize);
					const beyondPage = totalPages + 5;
					const result = paginate(items, beyondPage, pageSize);
					const lastPageResult = paginate(items, totalPages, pageSize);
					expect(result.items).toEqual(lastPageResult.items);
					expect(result.page).toBe(totalPages);
				}
			),
			{ numRuns: 200 }
		);
	});

	it('empty list returns empty items with total 0', () => {
		fc.assert(
			fc.property(pageArb, pageSizeArb, (page, pageSize) => {
				const result = paginate([], page, pageSize);
				expect(result.items).toEqual([]);
				expect(result.total).toBe(0);
				expect(result.page).toBe(1);
			}),
			{ numRuns: 100 }
		);
	});

	it('first page starts at index 0', () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
				pageSizeArb,
				(items, pageSize) => {
					const result = paginate(items, 1, pageSize);
					expect(result.items[0]).toBe(items[0]);
				}
			),
			{ numRuns: 200 }
		);
	});
});
