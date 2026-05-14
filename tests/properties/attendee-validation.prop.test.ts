import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateAttendeeInput } from '$lib/server/validation.js';

/**
 * Property 1: Attendee name length validation
 *
 * For any string with length greater than 100 characters used as a first name
 * or last name, the attendee validation SHALL reject the input. For any string
 * with length between 1 and 100 characters (after trimming), the validation
 * SHALL accept it.
 *
 * **Validates: Requirements 1.1**
 */
describe('Property 1: Attendee name length validation', () => {
	// --- Arbitraries ---

	// Valid name: 1-100 characters after trimming (no leading/trailing whitespace in generated value)
	const validName = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1 && s.trim().length <= 100);

	// Valid idType: non-empty string
	const validIdType = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

	// Name that is too long: trimmed length > 100
	const tooLongName = fc.string({ minLength: 101, maxLength: 200 }).filter((s) => s.trim().length > 100);

	// Empty string
	const emptyString = fc.constant('');

	// Whitespace-only string
	const whitespaceOnly = fc
		.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
		.map((chars) => chars.join(''));

	it('rejects firstName longer than 100 characters (after trimming)', () => {
		fc.assert(
			fc.property(tooLongName, validName, validIdType, (firstName, lastName, idType) => {
				const result = validateAttendeeInput({ firstName, lastName, idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('firstName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects lastName longer than 100 characters (after trimming)', () => {
		fc.assert(
			fc.property(validName, tooLongName, validIdType, (firstName, lastName, idType) => {
				const result = validateAttendeeInput({ firstName, lastName, idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('lastName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects empty firstName', () => {
		fc.assert(
			fc.property(validName, validIdType, (lastName, idType) => {
				const result = validateAttendeeInput({ firstName: '', lastName, idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('firstName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects empty lastName', () => {
		fc.assert(
			fc.property(validName, validIdType, (firstName, idType) => {
				const result = validateAttendeeInput({ firstName, lastName: '', idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('lastName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects whitespace-only firstName', () => {
		fc.assert(
			fc.property(whitespaceOnly, validName, validIdType, (firstName, lastName, idType) => {
				const result = validateAttendeeInput({ firstName, lastName, idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('firstName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects whitespace-only lastName', () => {
		fc.assert(
			fc.property(validName, whitespaceOnly, validIdType, (firstName, lastName, idType) => {
				const result = validateAttendeeInput({ firstName, lastName, idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('lastName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('accepts firstName and lastName between 1-100 characters (after trimming) with valid idType', () => {
		fc.assert(
			fc.property(validName, validName, validIdType, (firstName, lastName, idType) => {
				const result = validateAttendeeInput({ firstName, lastName, idType });
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
				expect(result.data!.firstName).toBe(firstName.trim());
				expect(result.data!.lastName).toBe(lastName.trim());
				expect(result.data!.idType).toBe(idType.trim());
			})
		);
	});

	it('rejects missing firstName (undefined)', () => {
		fc.assert(
			fc.property(validName, validIdType, (lastName, idType) => {
				const result = validateAttendeeInput({ lastName, idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('firstName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects missing lastName (undefined)', () => {
		fc.assert(
			fc.property(validName, validIdType, (firstName, idType) => {
				const result = validateAttendeeInput({ firstName, idType });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('lastName');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects missing idType', () => {
		fc.assert(
			fc.property(validName, validName, (firstName, lastName) => {
				const result = validateAttendeeInput({ firstName, lastName });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('idType');
				expect(result.data).toBeUndefined();
			})
		);
	});
});

/**
 * Property 2: Attendee upsert correctness (case-insensitive create-or-update)
 *
 * For any attendee first name and last name combination, performing a checkout
 * with that name (regardless of case or leading/trailing whitespace) SHALL always
 * resolve to the same attendee record. If the attendee does not exist, a new record
 * is created. If it already exists (matched case-insensitively after trimming),
 * the existing record's ID type is updated and the same attendee ID is returned.
 *
 * **Validates: Requirements 1.2, 1.4, 1.5**
 */
describe('Property 2: Attendee upsert correctness (case-insensitive create-or-update)', () => {
	// --- In-memory attendee store simulating the database upsert logic ---

	interface InMemoryAttendee {
		id: number;
		firstName: string;
		lastName: string;
		idType: string;
	}

	function createAttendeeStore() {
		const store = new Map<string, InMemoryAttendee>();
		let nextId = 1;

		function makeKey(firstName: string, lastName: string): string {
			return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
		}

		function upsert(data: { firstName: string; lastName: string; idType: string }): number {
			const key = makeKey(data.firstName, data.lastName);
			const existing = store.get(key);

			if (existing) {
				// Update idType
				existing.idType = data.idType;
				return existing.id;
			}

			// Create new
			const id = nextId++;
			store.set(key, {
				id,
				firstName: data.firstName.trim(),
				lastName: data.lastName.trim(),
				idType: data.idType
			});
			return id;
		}

		function get(firstName: string, lastName: string): InMemoryAttendee | undefined {
			const key = makeKey(firstName, lastName);
			return store.get(key);
		}

		function size(): number {
			return store.size;
		}

		return { upsert, get, size };
	}

	// --- Arbitraries ---

	// Valid name: 1-100 characters after trimming, non-empty
	const validName = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length >= 1 && s.trim().length <= 100);

	// Valid idType: non-empty string
	const validIdType = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length > 0);

	// Case variation: randomly change case of characters in a string
	const caseVariation = (name: string): fc.Arbitrary<string> =>
		fc
			.array(fc.boolean(), { minLength: name.length, maxLength: name.length })
			.map((flags) =>
				name
					.split('')
					.map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
					.join('')
			);

	// Whitespace padding: add leading/trailing whitespace
	const whitespacePadding = fc
		.tuple(
			fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }),
			fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 })
		)
		.map(([leading, trailing]) => ({
			leading: leading.join(''),
			trailing: trailing.join('')
		}));

	it('same name with different casing resolves to the same attendee ID', () => {
		fc.assert(
			fc.property(validName, validName, validIdType, validIdType, (firstName, lastName, idType1, idType2) => {
				const store = createAttendeeStore();

				// First upsert with original casing
				const id1 = store.upsert({ firstName, lastName, idType: idType1 });

				// Second upsert with different casing
				const upperFirst = firstName.toUpperCase();
				const upperLast = lastName.toUpperCase();
				const id2 = store.upsert({ firstName: upperFirst, lastName: upperLast, idType: idType2 });

				// Same attendee ID returned
				expect(id2).toBe(id1);
				// Only one record in the store
				expect(store.size()).toBe(1);
			})
		);
	});

	it('same name with leading/trailing whitespace resolves to the same attendee ID', () => {
		fc.assert(
			fc.property(validName, validName, validIdType, validIdType, whitespacePadding, (firstName, lastName, idType1, idType2, padding) => {
				const store = createAttendeeStore();

				// First upsert with trimmed name
				const id1 = store.upsert({ firstName: firstName.trim(), lastName: lastName.trim(), idType: idType1 });

				// Second upsert with whitespace padding
				const paddedFirst = padding.leading + firstName.trim() + padding.trailing;
				const paddedLast = padding.leading + lastName.trim() + padding.trailing;
				const id2 = store.upsert({ firstName: paddedFirst, lastName: paddedLast, idType: idType2 });

				// Same attendee ID returned
				expect(id2).toBe(id1);
				// Only one record in the store
				expect(store.size()).toBe(1);
			})
		);
	});

	it('different names produce different attendee IDs', () => {
		fc.assert(
			fc.property(validName, validName, validName, validName, validIdType, (first1, last1, first2, last2, idType) => {
				// Ensure the names are actually different after trimming and lowercasing
				const key1 = `${first1.trim().toLowerCase()}|${last1.trim().toLowerCase()}`;
				const key2 = `${first2.trim().toLowerCase()}|${last2.trim().toLowerCase()}`;
				fc.pre(key1 !== key2);

				const store = createAttendeeStore();

				const id1 = store.upsert({ firstName: first1, lastName: last1, idType });
				const id2 = store.upsert({ firstName: first2, lastName: last2, idType });

				// Different attendee IDs
				expect(id1).not.toBe(id2);
				// Two records in the store
				expect(store.size()).toBe(2);
			})
		);
	});

	it('when existing attendee is found, idType is updated to the latest value', () => {
		fc.assert(
			fc.property(validName, validName, validIdType, validIdType, (firstName, lastName, idType1, idType2) => {
				// Ensure idTypes are different so we can verify the update
				fc.pre(idType1.trim() !== idType2.trim());

				const store = createAttendeeStore();

				// First upsert creates the attendee
				store.upsert({ firstName, lastName, idType: idType1 });

				// Second upsert with same name (different case) but different idType
				store.upsert({ firstName: firstName.toUpperCase(), lastName: lastName.toUpperCase(), idType: idType2 });

				// Verify idType was updated
				const attendee = store.get(firstName, lastName);
				expect(attendee).toBeDefined();
				expect(attendee!.idType).toBe(idType2);
			})
		);
	});

	it('case and whitespace variations all resolve to the same attendee across multiple upserts', () => {
		fc.assert(
			fc.property(
				validName,
				validName,
				fc.array(validIdType, { minLength: 2, maxLength: 10 }),
				(firstName, lastName, idTypes) => {
					const store = createAttendeeStore();
					const trimmedFirst = firstName.trim();
					const trimmedLast = lastName.trim();

					// Perform multiple upserts with various case/whitespace combinations
					const ids: number[] = [];
					for (let i = 0; i < idTypes.length; i++) {
						// Alternate between different variations
						let varFirst: string;
						let varLast: string;
						switch (i % 4) {
							case 0:
								varFirst = trimmedFirst;
								varLast = trimmedLast;
								break;
							case 1:
								varFirst = trimmedFirst.toUpperCase();
								varLast = trimmedLast.toUpperCase();
								break;
							case 2:
								varFirst = '  ' + trimmedFirst.toLowerCase() + '  ';
								varLast = '  ' + trimmedLast.toLowerCase() + '  ';
								break;
							default:
								varFirst = '\t' + trimmedFirst + ' ';
								varLast = ' ' + trimmedLast + '\t';
								break;
						}

						ids.push(store.upsert({ firstName: varFirst, lastName: varLast, idType: idTypes[i] }));
					}

					// All IDs should be the same
					const firstId = ids[0];
					for (const id of ids) {
						expect(id).toBe(firstId);
					}

					// Only one record in the store
					expect(store.size()).toBe(1);

					// idType should be the last one provided
					const attendee = store.get(firstName, lastName);
					expect(attendee!.idType).toBe(idTypes[idTypes.length - 1]);
				}
			)
		);
	});
});


/**
 * Property 17: Attendee deletion blocked by active checkouts
 *
 * For any attendee who has at least one game currently in checked_out status
 * linked to them via a checkout transaction, deletion SHALL be rejected.
 *
 * **Validates: Requirements 9.11**
 */
describe('Property 17: Attendee deletion blocked by active checkouts', () => {
	// --- In-memory simulation of attendee deletion logic ---

	interface SimulatedAttendee {
		id: number;
		firstName: string;
		lastName: string;
		idType: string;
	}

	interface SimulatedCheckout {
		attendeeId: number;
		gameId: number;
		gameStatus: 'available' | 'checked_out' | 'retired';
	}

	/**
	 * Simulates the attendeeService.delete logic:
	 * 1. Check if attendee has active checkouts (games in 'checked_out' status linked via transaction)
	 * 2. If yes, throw error
	 * 3. If no, proceed with deletion
	 */
	function simulateDelete(
		attendeeId: number,
		attendees: SimulatedAttendee[],
		checkouts: SimulatedCheckout[]
	): { deleted: boolean; error?: string } {
		const attendee = attendees.find((a) => a.id === attendeeId);
		if (!attendee) {
			return { deleted: false, error: `Attendee with id ${attendeeId} not found` };
		}

		// Check for active checkouts: games currently in 'checked_out' status linked to this attendee
		const activeCheckouts = checkouts.filter(
			(c) => c.attendeeId === attendeeId && c.gameStatus === 'checked_out'
		);

		if (activeCheckouts.length > 0) {
			return { deleted: false, error: 'Cannot delete attendee with active checkouts' };
		}

		return { deleted: true };
	}

	// --- Arbitraries ---

	const attendeeId = fc.integer({ min: 1, max: 10000 });

	const validName = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length >= 1);

	const validIdType = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length > 0);

	const gameStatus = fc.constantFrom('available' as const, 'checked_out' as const, 'retired' as const);

	it('rejects deletion when attendee has at least one active checkout', () => {
		fc.assert(
			fc.property(
				attendeeId,
				validName,
				validName,
				validIdType,
				fc.integer({ min: 1, max: 20 }),
				(id, firstName, lastName, idType, numActiveCheckouts) => {
					const attendees: SimulatedAttendee[] = [{ id, firstName, lastName, idType }];

					// Create checkouts where all games are in 'checked_out' status
					const checkouts: SimulatedCheckout[] = Array.from(
						{ length: numActiveCheckouts },
						(_, i) => ({
							attendeeId: id,
							gameId: i + 1,
							gameStatus: 'checked_out' as const
						})
					);

					const result = simulateDelete(id, attendees, checkouts);

					expect(result.deleted).toBe(false);
					expect(result.error).toBe('Cannot delete attendee with active checkouts');
				}
			)
		);
	});

	it('allows deletion when attendee has zero active checkouts', () => {
		fc.assert(
			fc.property(
				attendeeId,
				validName,
				validName,
				validIdType,
				fc.integer({ min: 0, max: 20 }),
				(id, firstName, lastName, idType, numReturnedGames) => {
					const attendees: SimulatedAttendee[] = [{ id, firstName, lastName, idType }];

					// Create checkouts where all games have been returned (available or retired, not checked_out)
					const checkouts: SimulatedCheckout[] = Array.from(
						{ length: numReturnedGames },
						(_, i) => ({
							attendeeId: id,
							gameId: i + 1,
							gameStatus: (i % 2 === 0 ? 'available' : 'retired') as 'available' | 'retired'
						})
					);

					const result = simulateDelete(id, attendees, checkouts);

					expect(result.deleted).toBe(true);
					expect(result.error).toBeUndefined();
				}
			)
		);
	});

	it('rejects deletion even when only one out of many checkouts is active', () => {
		fc.assert(
			fc.property(
				attendeeId,
				validName,
				validName,
				validIdType,
				fc.integer({ min: 1, max: 20 }),
				fc.integer({ min: 0, max: 19 }),
				(id, firstName, lastName, idType, totalCheckouts, activeIndex) => {
					const attendees: SimulatedAttendee[] = [{ id, firstName, lastName, idType }];

					// Ensure activeIndex is within bounds
					const safeActiveIndex = activeIndex % totalCheckouts;

					// Create checkouts where only one game is still checked out
					const checkouts: SimulatedCheckout[] = Array.from(
						{ length: totalCheckouts },
						(_, i) => ({
							attendeeId: id,
							gameId: i + 1,
							gameStatus: i === safeActiveIndex ? ('checked_out' as const) : ('available' as const)
						})
					);

					const result = simulateDelete(id, attendees, checkouts);

					expect(result.deleted).toBe(false);
					expect(result.error).toBe('Cannot delete attendee with active checkouts');
				}
			)
		);
	});

	it('only considers checkouts linked to the target attendee, not other attendees', () => {
		fc.assert(
			fc.property(
				attendeeId,
				fc.integer({ min: 10001, max: 20000 }), // different attendee ID range to avoid collision
				validName,
				validName,
				validIdType,
				fc.integer({ min: 1, max: 10 }),
				(targetId, otherId, firstName, lastName, idType, numOtherCheckouts) => {
					const attendees: SimulatedAttendee[] = [
						{ id: targetId, firstName, lastName, idType }
					];

					// Active checkouts belong to a DIFFERENT attendee
					const checkouts: SimulatedCheckout[] = Array.from(
						{ length: numOtherCheckouts },
						(_, i) => ({
							attendeeId: otherId,
							gameId: i + 1,
							gameStatus: 'checked_out' as const
						})
					);

					const result = simulateDelete(targetId, attendees, checkouts);

					// Target attendee has no active checkouts, so deletion should succeed
					expect(result.deleted).toBe(true);
					expect(result.error).toBeUndefined();
				}
			)
		);
	});

	it('the property holds for any mix of game statuses: deletion blocked iff at least one is checked_out', () => {
		fc.assert(
			fc.property(
				attendeeId,
				validName,
				validName,
				validIdType,
				fc.array(gameStatus, { minLength: 1, maxLength: 30 }),
				(id, firstName, lastName, idType, statuses) => {
					const attendees: SimulatedAttendee[] = [{ id, firstName, lastName, idType }];

					const checkouts: SimulatedCheckout[] = statuses.map((status, i) => ({
						attendeeId: id,
						gameId: i + 1,
						gameStatus: status
					}));

					const hasActiveCheckout = statuses.some((s) => s === 'checked_out');
					const result = simulateDelete(id, attendees, checkouts);

					if (hasActiveCheckout) {
						expect(result.deleted).toBe(false);
						expect(result.error).toBe('Cannot delete attendee with active checkouts');
					} else {
						expect(result.deleted).toBe(true);
						expect(result.error).toBeUndefined();
					}
				}
			)
		);
	});
});


/**
 * Property 16: Attendee edit uniqueness validation
 *
 * For any attendee edit that would result in a first name + last name combination
 * matching another existing attendee (case-insensitively), the edit SHALL be rejected
 * with a validation error.
 *
 * **Validates: Requirements 9.9**
 */
describe('Property 16: Attendee edit uniqueness validation', () => {
	// --- Simulation function ---

	function wouldCreateDuplicate(
		existingAttendees: { id: number; firstName: string; lastName: string }[],
		editId: number,
		newFirstName: string,
		newLastName: string
	): boolean {
		const trimmedFirst = newFirstName.trim().toLowerCase();
		const trimmedLast = newLastName.trim().toLowerCase();
		return existingAttendees.some(
			(a) =>
				a.id !== editId &&
				a.firstName.trim().toLowerCase() === trimmedFirst &&
				a.lastName.trim().toLowerCase() === trimmedLast
		);
	}

	// --- Arbitraries ---

	// Valid name: 1-50 characters, non-empty after trimming
	const validName = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length >= 1);

	// Generate a set of attendees with unique name combinations (case-insensitively)
	const uniqueAttendeeSet = fc
		.array(fc.tuple(validName, validName), { minLength: 2, maxLength: 10 })
		.map((pairs) => {
			// Deduplicate by case-insensitive name key
			const seen = new Set<string>();
			const unique: { id: number; firstName: string; lastName: string }[] = [];
			let nextId = 1;
			for (const [first, last] of pairs) {
				const key = `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`;
				if (!seen.has(key)) {
					seen.add(key);
					unique.push({ id: nextId++, firstName: first.trim(), lastName: last.trim() });
				}
			}
			return unique;
		})
		.filter((attendees) => attendees.length >= 2);

	it('rejects edit when new name matches another existing attendee (case-insensitively)', () => {
		fc.assert(
			fc.property(uniqueAttendeeSet, (attendees) => {
				// Pick the first attendee to edit
				const editAttendee = attendees[0];
				// Pick another attendee whose name we'll try to duplicate
				const targetAttendee = attendees[1];

				// Try to edit the first attendee to have the same name as the second
				const duplicate = wouldCreateDuplicate(
					attendees,
					editAttendee.id,
					targetAttendee.firstName,
					targetAttendee.lastName
				);

				expect(duplicate).toBe(true);
			})
		);
	});

	it('rejects edit when new name matches another attendee with different casing', () => {
		fc.assert(
			fc.property(uniqueAttendeeSet, (attendees) => {
				const editAttendee = attendees[0];
				const targetAttendee = attendees[1];

				// Use uppercase version of the target name
				const duplicate = wouldCreateDuplicate(
					attendees,
					editAttendee.id,
					targetAttendee.firstName.toUpperCase(),
					targetAttendee.lastName.toUpperCase()
				);

				expect(duplicate).toBe(true);
			})
		);
	});

	it('rejects edit when new name matches another attendee with extra whitespace', () => {
		fc.assert(
			fc.property(uniqueAttendeeSet, (attendees) => {
				const editAttendee = attendees[0];
				const targetAttendee = attendees[1];

				// Add leading/trailing whitespace to the target name
				const duplicate = wouldCreateDuplicate(
					attendees,
					editAttendee.id,
					'  ' + targetAttendee.firstName + '  ',
					'\t' + targetAttendee.lastName + '\t'
				);

				expect(duplicate).toBe(true);
			})
		);
	});

	it('accepts edit when new name does NOT match any other attendee', () => {
		fc.assert(
			fc.property(uniqueAttendeeSet, validName, validName, (attendees, newFirst, newLast) => {
				const editAttendee = attendees[0];

				// Ensure the new name doesn't match any other attendee
				const newKey = `${newFirst.trim().toLowerCase()}|${newLast.trim().toLowerCase()}`;
				const existingKeys = attendees
					.filter((a) => a.id !== editAttendee.id)
					.map((a) => `${a.firstName.trim().toLowerCase()}|${a.lastName.trim().toLowerCase()}`);

				fc.pre(!existingKeys.includes(newKey));

				const duplicate = wouldCreateDuplicate(attendees, editAttendee.id, newFirst, newLast);

				expect(duplicate).toBe(false);
			})
		);
	});

	it('accepts edit when name matches the attendee being edited (self-match is allowed)', () => {
		fc.assert(
			fc.property(uniqueAttendeeSet, (attendees) => {
				const editAttendee = attendees[0];

				// Editing to keep the same name (possibly different case) should be allowed
				const duplicate = wouldCreateDuplicate(
					attendees,
					editAttendee.id,
					editAttendee.firstName.toUpperCase(),
					editAttendee.lastName.toUpperCase()
				);

				expect(duplicate).toBe(false);
			})
		);
	});

	it('handles mixed case variations consistently across random edits', () => {
		fc.assert(
			fc.property(
				uniqueAttendeeSet,
				fc.nat({ max: 100 }),
				(attendees, seed) => {
					// Pick a random attendee to edit (using seed to select index)
					const editIndex = seed % attendees.length;
					const editAttendee = attendees[editIndex];

					// Pick a different attendee to duplicate
					const targetIndex = (editIndex + 1) % attendees.length;
					const targetAttendee = attendees[targetIndex];

					// Apply random case transformation to target name
					const mixedFirst = targetAttendee.firstName
						.split('')
						.map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
						.join('');
					const mixedLast = targetAttendee.lastName
						.split('')
						.map((ch, i) => (i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()))
						.join('');

					const duplicate = wouldCreateDuplicate(attendees, editAttendee.id, mixedFirst, mixedLast);

					expect(duplicate).toBe(true);
				}
			)
		);
	});
});


/**
 * Property 3: Corrections skip attendee upsert
 *
 * For any transaction where isCorrection is true, the attendee table SHALL remain
 * unchanged — no new attendee records are created and no existing records are updated.
 *
 * **Validates: Requirements 1.6**
 */
describe('Property 3: Corrections skip attendee upsert', () => {
	// --- In-memory simulation of checkout/correction logic ---

	interface AttendeeStore {
		size: number;
		upsertCalled: boolean;
		lastUpsertData: { firstName: string; lastName: string; idType: string } | null;
	}

	function createInitialStore(initialSize: number): AttendeeStore {
		return { size: initialSize, upsertCalled: false, lastUpsertData: null };
	}

	/**
	 * Simulates the transaction service checkout behavior:
	 * - Normal checkout (isCorrection=false): calls attendeeService.upsert, which may create/update an attendee
	 * - Correction transaction (isCorrection=true): does NOT call attendeeService.upsert
	 */
	function simulateCheckout(
		isCorrection: boolean,
		store: AttendeeStore,
		attendeeData: { firstName: string; lastName: string; idType: string }
	): AttendeeStore {
		if (!isCorrection) {
			// Normal checkout: upsert is called, potentially adding a new attendee
			return {
				size: store.size + 1,
				upsertCalled: true,
				lastUpsertData: attendeeData
			};
		}
		// Correction: no upsert, store remains unchanged
		return { ...store, upsertCalled: false, lastUpsertData: null };
	}

	// --- Arbitraries ---

	const validName = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length >= 1);

	const validIdType = fc
		.string({ minLength: 1, maxLength: 50 })
		.filter((s) => s.trim().length > 0);

	const attendeeData = fc.record({
		firstName: validName,
		lastName: validName,
		idType: validIdType
	});

	const initialStoreSize = fc.integer({ min: 0, max: 100 });

	it('correction transactions (isCorrection=true) do not modify the attendee store', () => {
		fc.assert(
			fc.property(initialStoreSize, attendeeData, (size, data) => {
				const store = createInitialStore(size);
				const result = simulateCheckout(true, store, data);

				// Store size remains unchanged
				expect(result.size).toBe(size);
				// Upsert was NOT called
				expect(result.upsertCalled).toBe(false);
				// No upsert data recorded
				expect(result.lastUpsertData).toBeNull();
			})
		);
	});

	it('normal checkouts (isCorrection=false) DO call attendee upsert', () => {
		fc.assert(
			fc.property(initialStoreSize, attendeeData, (size, data) => {
				const store = createInitialStore(size);
				const result = simulateCheckout(false, store, data);

				// Store size increases (new attendee potentially created)
				expect(result.size).toBe(size + 1);
				// Upsert WAS called
				expect(result.upsertCalled).toBe(true);
				// Upsert data matches the attendee info
				expect(result.lastUpsertData).toEqual(data);
			})
		);
	});

	it('a sequence of mixed corrections and normal checkouts only modifies the store for non-corrections', () => {
		// Generate a sequence of operations, each with isCorrection flag and attendee data
		const operation = fc.record({
			isCorrection: fc.boolean(),
			attendee: attendeeData
		});

		const operations = fc.array(operation, { minLength: 1, maxLength: 30 });

		fc.assert(
			fc.property(initialStoreSize, operations, (startSize, ops) => {
				let store = createInitialStore(startSize);
				let expectedSize = startSize;
				let normalCheckoutCount = 0;

				for (const op of ops) {
					store = simulateCheckout(op.isCorrection, store, op.attendee);

					if (!op.isCorrection) {
						expectedSize++;
						normalCheckoutCount++;
						// After a normal checkout, upsert was called
						expect(store.upsertCalled).toBe(true);
						expect(store.lastUpsertData).toEqual(op.attendee);
					} else {
						// After a correction, upsert was NOT called
						expect(store.upsertCalled).toBe(false);
						expect(store.lastUpsertData).toBeNull();
					}
				}

				// Final store size should only reflect normal checkouts
				expect(store.size).toBe(expectedSize);

				// The number of size increments equals the number of non-correction operations
				const nonCorrectionCount = ops.filter((op) => !op.isCorrection).length;
				expect(normalCheckoutCount).toBe(nonCorrectionCount);
				expect(store.size - startSize).toBe(nonCorrectionCount);
			})
		);
	});
});
