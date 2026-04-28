import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateCheckoutInput, validateCheckinInput } from '$lib/server/validation.js';

// --- Shared generators ---

const validGameId = fc.integer({ min: 1, max: 1_000_000 });
const validGameVersion = fc.integer({ min: 1, max: 1_000_000 });
const nonEmptyString = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
const positiveWeight = fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true });

// Valid checkout input arbitrary
const validCheckoutInput = fc.record({
	gameId: validGameId,
	gameVersion: validGameVersion,
	attendeeFirstName: nonEmptyString,
	attendeeLastName: nonEmptyString,
	idType: nonEmptyString,
	checkoutWeight: positiveWeight
});

// Valid checkin input arbitrary
const validCheckinInput = fc.record({
	gameId: validGameId,
	checkinWeight: positiveWeight
});

/**
 * Property 2: Checkout validation rejects incomplete input
 *
 * For any checkout attempt where any required field (attendee first name,
 * attendee last name, ID type, or checkout weight) is missing or where
 * checkout weight is not a positive number, the system SHALL reject the
 * checkout and return a validation error identifying the missing/invalid fields.
 *
 * **Validates: Requirements 4.4, 4.5, 4.6, 4.7, 4.8**
 */
describe('Property 2: Checkout validation rejects incomplete input', () => {
	const requiredFields = [
		'gameId',
		'gameVersion',
		'attendeeFirstName',
		'attendeeLastName',
		'idType',
		'checkoutWeight'
	] as const;

	for (const field of requiredFields) {
		it(`rejects checkout input missing required field: ${field}`, () => {
			fc.assert(
				fc.property(validCheckoutInput, (base) => {
					const input = { ...base };
					delete (input as any)[field];
					const result = validateCheckoutInput(input);
					expect(result.valid).toBe(false);
					expect(result.errors).toHaveProperty(field);
					expect(result.data).toBeUndefined();
				}),
				{ numRuns: 100 }
			);
		});
	}

	it('rejects checkout input with invalid checkoutWeight (zero, negative, NaN, Infinity)', () => {
		const invalidWeight = fc.oneof(
			fc.constant(0),
			fc.double({ min: -10_000, max: -0.01, noNaN: true, noDefaultInfinity: true }),
			fc.constant(NaN),
			fc.constant(Infinity),
			fc.constant(-Infinity)
		);

		fc.assert(
			fc.property(validCheckoutInput, invalidWeight, (base, badWeight) => {
				const input = { ...base, checkoutWeight: badWeight };
				const result = validateCheckoutInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkoutWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('accepts fully valid checkout input', () => {
		fc.assert(
			fc.property(validCheckoutInput, (input) => {
				const result = validateCheckoutInput(input);
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
			}),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 3: Checkin validation rejects missing or invalid weight
 *
 * For any checkin attempt where the checkin weight is missing or not a
 * positive number, the system SHALL reject the checkin and return a
 * validation error.
 *
 * **Validates: Requirements 5.5, 5.8**
 */
describe('Property 3: Checkin validation rejects missing or invalid weight', () => {
	it('rejects checkin input with missing checkinWeight', () => {
		fc.assert(
			fc.property(validGameId, (gameId) => {
				const result = validateCheckinInput({ gameId });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkinWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects checkin input with invalid checkinWeight (zero, negative, NaN, Infinity)', () => {
		const invalidWeight = fc.oneof(
			fc.constant(0),
			fc.double({ min: -10_000, max: -0.01, noNaN: true, noDefaultInfinity: true }),
			fc.constant(NaN),
			fc.constant(Infinity),
			fc.constant(-Infinity)
		);

		fc.assert(
			fc.property(validCheckinInput, invalidWeight, (base, badWeight) => {
				const input = { ...base, checkinWeight: badWeight };
				const result = validateCheckinInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkinWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('accepts fully valid checkin input', () => {
		fc.assert(
			fc.property(validCheckinInput, (input) => {
				const result = validateCheckinInput(input);
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
			}),
			{ numRuns: 100 }
		);
	});
});

/**
 * Property 6: Transaction data round-trip
 *
 * For any successful checkout, the stored data SHALL contain the exact
 * attendee first name, attendee last name, ID type, checkout weight, and
 * note that were provided as input (with strings trimmed). For any
 * successful checkin, the stored data SHALL contain the exact checkin
 * weight and note that were provided as input (with strings trimmed).
 *
 * **Validates: Requirements 4.9, 4.15, 5.6, 5.13**
 */
describe('Property 6: Transaction data round-trip', () => {
	it('checkout round-trip: returned data matches trimmed input exactly', () => {
		const optionalNote = fc.oneof(fc.constant(undefined), nonEmptyString);

		fc.assert(
			fc.property(validCheckoutInput, optionalNote, (base, note) => {
				const input = { ...base, note };
				const result = validateCheckoutInput(input);
				expect(result.valid).toBe(true);
				expect(result.data).toBeDefined();

				const data = result.data!;
				expect(data.attendeeFirstName).toBe(base.attendeeFirstName.trim());
				expect(data.attendeeLastName).toBe(base.attendeeLastName.trim());
				expect(data.idType).toBe(base.idType.trim());
				expect(data.checkoutWeight).toBe(base.checkoutWeight);
				expect(data.gameId).toBe(base.gameId);
				expect(data.gameVersion).toBe(base.gameVersion);

				if (note !== undefined && note.trim().length > 0) {
					expect(data.note).toBe(note.trim());
				} else {
					expect(data.note).toBeUndefined();
				}
			}),
			{ numRuns: 100 }
		);
	});

	it('checkin round-trip: returned data matches trimmed input exactly', () => {
		const optionalNote = fc.oneof(fc.constant(undefined), nonEmptyString);
		const optionalTakesGame = fc.oneof(fc.constant(undefined), fc.boolean());

		fc.assert(
			fc.property(validCheckinInput, optionalNote, optionalTakesGame, (base, note, takesGame) => {
				const input = { ...base, note, attendeeTakesGame: takesGame };
				const result = validateCheckinInput(input);
				expect(result.valid).toBe(true);
				expect(result.data).toBeDefined();

				const data = result.data!;
				expect(data.checkinWeight).toBe(base.checkinWeight);
				expect(data.gameId).toBe(base.gameId);
				expect(data.attendeeTakesGame).toBe(takesGame ?? false);

				if (note !== undefined && note.trim().length > 0) {
					expect(data.note).toBe(note.trim());
				} else {
					expect(data.note).toBeUndefined();
				}
			}),
			{ numRuns: 100 }
		);
	});

	it('checkout: empty/whitespace-only notes become undefined', () => {
		const whitespaceNote = fc
			.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 20 })
			.map((chars) => chars.join(''));

		fc.assert(
			fc.property(validCheckoutInput, whitespaceNote, (base, note) => {
				const input = { ...base, note };
				const result = validateCheckoutInput(input);
				expect(result.valid).toBe(true);
				expect(result.data!.note).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('checkin: empty/whitespace-only notes become undefined', () => {
		const whitespaceNote = fc
			.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 20 })
			.map((chars) => chars.join(''));

		fc.assert(
			fc.property(validCheckinInput, whitespaceNote, (base, note) => {
				const input = { ...base, note };
				const result = validateCheckinInput(input);
				expect(result.valid).toBe(true);
				expect(result.data!.note).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});
});
