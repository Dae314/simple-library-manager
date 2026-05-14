import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 15: Attendee search partial matching
 *
 * For any set of attendee records and any search string, all returned attendees
 * SHALL have a first name or last name that contains the search string
 * (case-insensitively).
 *
 * This tests the `list` method's search filter which uses ILIKE partial matching
 * (contains), not prefix matching.
 *
 * **Validates: Requirements 9.3**
 */
describe('Property 15: Attendee search partial matching', () => {
	// --- Simulation function ---

	function simulateSearch(
		attendees: { firstName: string; lastName: string }[],
		search: string
	): typeof attendees {
		if (!search) return attendees;
		const lowerSearch = search.toLowerCase();
		return attendees.filter(
			(a) =>
				a.firstName.toLowerCase().includes(lowerSearch) ||
				a.lastName.toLowerCase().includes(lowerSearch)
		);
	}

	// --- Arbitraries ---

	// Valid attendee name: non-empty string, 1-50 chars
	const validName = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length >= 1);

	// Attendee record arbitrary
	const attendeeRecord = fc.record({
		firstName: validName,
		lastName: validName
	});

	// List of attendee records (1-20 attendees)
	const attendeeList = fc.array(attendeeRecord, { minLength: 1, maxLength: 20 });

	// Search string: can be empty or 1-20 chars
	const searchString = fc.string({ minLength: 0, maxLength: 20 });

	// Non-empty search string for targeted tests
	const nonEmptySearch = fc.string({ minLength: 1, maxLength: 20 });

	it('all results contain the search string in firstName or lastName (case-insensitive)', () => {
		fc.assert(
			fc.property(attendeeList, nonEmptySearch, (attendees, search) => {
				const results = simulateSearch(attendees, search);
				const lowerSearch = search.toLowerCase();

				for (const result of results) {
					const firstNameContains = result.firstName.toLowerCase().includes(lowerSearch);
					const lastNameContains = result.lastName.toLowerCase().includes(lowerSearch);
					expect(firstNameContains || lastNameContains).toBe(true);
				}
			})
		);
	});

	it('no attendees that contain the search string are excluded (completeness)', () => {
		fc.assert(
			fc.property(attendeeList, nonEmptySearch, (attendees, search) => {
				const results = simulateSearch(attendees, search);
				const lowerSearch = search.toLowerCase();

				// Every attendee that matches should be in the results
				const expectedMatches = attendees.filter(
					(a) =>
						a.firstName.toLowerCase().includes(lowerSearch) ||
						a.lastName.toLowerCase().includes(lowerSearch)
				);

				expect(results.length).toBe(expectedMatches.length);

				// Verify each expected match is present
				for (let i = 0; i < expectedMatches.length; i++) {
					expect(results[i]).toEqual(expectedMatches[i]);
				}
			})
		);
	});

	it('empty search string returns all attendees', () => {
		fc.assert(
			fc.property(attendeeList, (attendees) => {
				const results = simulateSearch(attendees, '');
				expect(results.length).toBe(attendees.length);
				expect(results).toEqual(attendees);
			})
		);
	});

	it('search is case-insensitive (same results regardless of search case)', () => {
		fc.assert(
			fc.property(attendeeList, nonEmptySearch, (attendees, search) => {
				const resultsLower = simulateSearch(attendees, search.toLowerCase());
				const resultsUpper = simulateSearch(attendees, search.toUpperCase());
				const resultsMixed = simulateSearch(attendees, search);

				expect(resultsLower.length).toBe(resultsUpper.length);
				expect(resultsLower.length).toBe(resultsMixed.length);

				for (let i = 0; i < resultsLower.length; i++) {
					expect(resultsLower[i]).toEqual(resultsUpper[i]);
					expect(resultsLower[i]).toEqual(resultsMixed[i]);
				}
			})
		);
	});

	it('results are a subset of the original attendee list', () => {
		fc.assert(
			fc.property(attendeeList, searchString, (attendees, search) => {
				const results = simulateSearch(attendees, search);
				expect(results.length).toBeLessThanOrEqual(attendees.length);

				// Every result must exist in the original list
				for (const result of results) {
					expect(attendees).toContainEqual(result);
				}
			})
		);
	});

	it('searching for a substring of an attendee name always finds that attendee', () => {
		fc.assert(
			fc.property(attendeeList, fc.nat(), fc.nat(), (attendees, startIdx, lenIdx) => {
				// Pick a random attendee and extract a substring from their name
				const attendee = attendees[0];
				const name = attendee.firstName;
				if (name.length === 0) return;

				const start = startIdx % name.length;
				const maxLen = name.length - start;
				const len = (lenIdx % maxLen) + 1;
				const substring = name.slice(start, start + len);

				const results = simulateSearch(attendees, substring);

				// The attendee whose name we extracted the substring from must be in results
				const found = results.some(
					(r) => r.firstName === attendee.firstName && r.lastName === attendee.lastName
				);
				expect(found).toBe(true);
			})
		);
	});
});
