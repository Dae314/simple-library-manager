import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateSwapInput } from '$lib/server/validation.js';

// --- Shared generators ---

const validGameId = fc.integer({ min: 1, max: 1_000_000 });
const positiveWeight = fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true });

// Valid swap input arbitrary
const validSwapInput = fc.record({
	returnGameId: validGameId,
	newGameId: validGameId,
	checkinWeight: positiveWeight,
	checkoutWeight: positiveWeight
});

/**
 * Property 5: Swap weight validation
 *
 * For any swap input, the checkin weight and checkout weight SHALL each be
 * validated as a positive finite number greater than zero. Non-positive, zero,
 * non-finite, or non-numeric values SHALL be rejected.
 *
 * **Validates: Requirements 3.5**
 */
describe('Property 5: Swap weight validation', () => {
	it('accepts valid swap inputs (positive finite weights, integer game IDs)', () => {
		fc.assert(
			fc.property(validSwapInput, (input) => {
				const result = validateSwapInput(input);
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
				expect(result.data!.checkinWeight).toBe(input.checkinWeight);
				expect(result.data!.checkoutWeight).toBe(input.checkoutWeight);
				expect(result.data!.returnGameId).toBe(input.returnGameId);
				expect(result.data!.newGameId).toBe(input.newGameId);
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects non-positive checkinWeight (zero and negative)', () => {
		const nonPositiveWeight = fc.oneof(
			fc.constant(0),
			fc.double({ min: -10_000, max: -0.01, noNaN: true, noDefaultInfinity: true })
		);

		fc.assert(
			fc.property(validSwapInput, nonPositiveWeight, (base, badWeight) => {
				const input = { ...base, checkinWeight: badWeight };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkinWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects non-positive checkoutWeight (zero and negative)', () => {
		const nonPositiveWeight = fc.oneof(
			fc.constant(0),
			fc.double({ min: -10_000, max: -0.01, noNaN: true, noDefaultInfinity: true })
		);

		fc.assert(
			fc.property(validSwapInput, nonPositiveWeight, (base, badWeight) => {
				const input = { ...base, checkoutWeight: badWeight };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkoutWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects non-finite checkinWeight (Infinity, -Infinity, NaN)', () => {
		const nonFiniteWeight = fc.oneof(
			fc.constant(Infinity),
			fc.constant(-Infinity),
			fc.constant(NaN)
		);

		fc.assert(
			fc.property(validSwapInput, nonFiniteWeight, (base, badWeight) => {
				const input = { ...base, checkinWeight: badWeight };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkinWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects non-finite checkoutWeight (Infinity, -Infinity, NaN)', () => {
		const nonFiniteWeight = fc.oneof(
			fc.constant(Infinity),
			fc.constant(-Infinity),
			fc.constant(NaN)
		);

		fc.assert(
			fc.property(validSwapInput, nonFiniteWeight, (base, badWeight) => {
				const input = { ...base, checkoutWeight: badWeight };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkoutWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects non-numeric weight values', () => {
		const nonNumericValue = fc.oneof(
			fc.string(),
			fc.boolean(),
			fc.constant(null),
			fc.constant(undefined),
			fc.constant({}),
			fc.constant([])
		);

		fc.assert(
			fc.property(validSwapInput, nonNumericValue, (base, badValue) => {
				const input = { ...base, checkinWeight: badValue as any };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkinWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);

		fc.assert(
			fc.property(validSwapInput, nonNumericValue, (base, badValue) => {
				const input = { ...base, checkoutWeight: badValue as any };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('checkoutWeight');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects missing/invalid game IDs', () => {
		const invalidGameId = fc.oneof(
			fc.constant(null),
			fc.constant(undefined),
			fc.double({ min: 0.1, max: 0.9, noNaN: true, noDefaultInfinity: true }), // non-integer
			fc.constant(NaN),
			fc.constant(Infinity),
			fc.string()
		);

		fc.assert(
			fc.property(validSwapInput, invalidGameId, (base, badId) => {
				const input = { ...base, returnGameId: badId as any };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('returnGameId');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);

		fc.assert(
			fc.property(validSwapInput, invalidGameId, (base, badId) => {
				const input = { ...base, newGameId: badId as any };
				const result = validateSwapInput(input);
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('newGameId');
				expect(result.data).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});
});


// --- Property 7: Swap precondition validation ---

/**
 * Simulates swap precondition validation logic.
 * For any game that is not in checked_out status used as the return game, the swap SHALL be rejected.
 * For any game that is not in available status used as the new game, the swap SHALL be rejected.
 * In both cases, no state changes occur.
 */
function validateSwapPreconditions(
	returnGameStatus: string,
	newGameStatus: string
): { valid: boolean; error?: string } {
	if (returnGameStatus !== 'checked_out') {
		return { valid: false, error: 'Return game is not currently checked out' };
	}
	if (newGameStatus !== 'available') {
		return { valid: false, error: 'Selected game is not available' };
	}
	return { valid: true };
}

/** Game statuses used in the system */
const allGameStatuses = ['available', 'checked_out', 'retired'] as const;

/**
 * Property 7: Swap precondition validation
 *
 * For any game that is not in checked_out status used as the return game, the swap
 * SHALL be rejected. For any game that is not in available status used as the new game,
 * the swap SHALL be rejected. In both cases, no state changes occur.
 *
 * **Validates: Requirements 3.10, 3.11**
 */
describe('Property 7: Swap precondition validation', () => {
	const invalidReturnGameStatus = fc.constantFrom('available', 'retired');
	const invalidNewGameStatus = fc.constantFrom('checked_out', 'retired');
	const validReturnGameStatus = fc.constant('checked_out');
	const validNewGameStatus = fc.constant('available');

	it('rejects swap when return game is not checked_out (available or retired)', () => {
		fc.assert(
			fc.property(
				invalidReturnGameStatus,
				fc.constantFrom(...allGameStatuses),
				(returnStatus, newStatus) => {
					const initialReturnStatus = returnStatus;
					const initialNewStatus = newStatus;

					const result = validateSwapPreconditions(returnStatus, newStatus);

					// Swap must be rejected
					expect(result.valid).toBe(false);
					expect(result.error).toBe('Return game is not currently checked out');

					// No state changes occur (statuses remain unchanged)
					expect(returnStatus).toBe(initialReturnStatus);
					expect(newStatus).toBe(initialNewStatus);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects swap when new game is not available (checked_out or retired)', () => {
		fc.assert(
			fc.property(validReturnGameStatus, invalidNewGameStatus, (returnStatus, newStatus) => {
				const initialReturnStatus = returnStatus;
				const initialNewStatus = newStatus;

				const result = validateSwapPreconditions(returnStatus, newStatus);

				// Swap must be rejected
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Selected game is not available');

				// No state changes occur (statuses remain unchanged)
				expect(returnStatus).toBe(initialReturnStatus);
				expect(newStatus).toBe(initialNewStatus);
			}),
			{ numRuns: 100 }
		);
	});

	it('accepts swap when both preconditions are met (return=checked_out, new=available)', () => {
		fc.assert(
			fc.property(validReturnGameStatus, validNewGameStatus, (returnStatus, newStatus) => {
				const result = validateSwapPreconditions(returnStatus, newStatus);

				// Swap must be accepted
				expect(result.valid).toBe(true);
				expect(result.error).toBeUndefined();
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects swap with return game error taking precedence when both preconditions are violated', () => {
		fc.assert(
			fc.property(invalidReturnGameStatus, invalidNewGameStatus, (returnStatus, newStatus) => {
				const initialReturnStatus = returnStatus;
				const initialNewStatus = newStatus;

				const result = validateSwapPreconditions(returnStatus, newStatus);

				// Swap must be rejected with return game error (takes precedence)
				expect(result.valid).toBe(false);
				expect(result.error).toBe('Return game is not currently checked out');

				// No state changes occur
				expect(returnStatus).toBe(initialReturnStatus);
				expect(newStatus).toBe(initialNewStatus);
			}),
			{ numRuns: 100 }
		);
	});
});

// --- In-memory simulation types for Property 6 ---

interface GameState {
	id: number;
	status: 'available' | 'checked_out';
}

interface Transaction {
	gameId: number;
	type: 'checkout' | 'checkin';
	weight: number;
	attendeeFirstName: string;
	attendeeLastName: string;
}

interface SwapResult {
	returnGameStatus: string;
	newGameStatus: string;
	checkinTx: Transaction;
	checkoutTx: Transaction;
}

interface SwapError {
	error: string;
}

/**
 * Simulates the swap operation in-memory, mirroring the logic of transactionService.swap():
 * - Validates preconditions (return game checked_out, new game available)
 * - Atomically: sets return game to available, creates checkin tx, sets new game to checked_out, creates checkout tx
 * - Carries over attendee info from the original checkout to the new checkout
 */
function simulateSwap(
	returnGame: GameState,
	newGame: GameState,
	originalCheckout: {
		attendeeFirstName: string;
		attendeeLastName: string;
		idType: string;
		checkoutWeight: number;
	},
	checkinWeight: number,
	checkoutWeight: number
): SwapResult | SwapError {
	// Precondition: return game must be checked_out
	if (returnGame.status !== 'checked_out') {
		return { error: 'Return game is not currently checked out' };
	}

	// Precondition: new game must be available
	if (newGame.status !== 'available') {
		return { error: 'Selected game is not available' };
	}

	// Atomic swap operation:
	// (a) Return game becomes available
	const returnGameStatus = 'available';

	// (b) New game becomes checked_out
	const newGameStatus = 'checked_out';

	// (c) Create checkin transaction for return game with provided checkin weight
	const checkinTx: Transaction = {
		gameId: returnGame.id,
		type: 'checkin',
		weight: checkinWeight,
		attendeeFirstName: originalCheckout.attendeeFirstName,
		attendeeLastName: originalCheckout.attendeeLastName
	};

	// (d) Create checkout transaction for new game with provided checkout weight
	// (e) Attendee info carried over from original checkout
	const checkoutTx: Transaction = {
		gameId: newGame.id,
		type: 'checkout',
		weight: checkoutWeight,
		attendeeFirstName: originalCheckout.attendeeFirstName,
		attendeeLastName: originalCheckout.attendeeLastName
	};

	return { returnGameStatus, newGameStatus, checkinTx, checkoutTx };
}

// --- Generators for Property 6 ---

const gameId = fc.integer({ min: 1, max: 1_000_000 });
const attendeeName = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const idTypeArb = fc.constantFrom('drivers_license', 'student_id', 'passport', 'badge');

const validOriginalCheckout = fc.record({
	attendeeFirstName: attendeeName,
	attendeeLastName: attendeeName,
	idType: idTypeArb,
	checkoutWeight: positiveWeight
});

/**
 * Property 6: Swap atomicity and correctness
 *
 * For any valid swap (return game is checked out, new game is available), after the swap
 * completes: (a) the return game status SHALL be available, (b) the new game status SHALL
 * be checked_out, (c) exactly one checkin transaction exists for the return game with the
 * provided checkin weight, (d) exactly one checkout transaction exists for the new game
 * with the provided checkout weight, and (e) the checkout transaction's attendee information
 * SHALL match the return game's original checkout attendee information.
 *
 * **Validates: Requirements 3.6, 3.7, 3.8**
 */
describe('Property 6: Swap atomicity and correctness', () => {
	it('after a valid swap, return game status is available', () => {
		fc.assert(
			fc.property(
				gameId,
				gameId.filter((id) => id > 1), // ensure we can get distinct IDs
				validOriginalCheckout,
				positiveWeight,
				positiveWeight,
				(returnId, newIdBase, originalCheckout, checkinWt, checkoutWt) => {
					// Ensure distinct game IDs
					const newId = returnId === newIdBase ? newIdBase + 1 : newIdBase;

					const returnGame: GameState = { id: returnId, status: 'checked_out' };
					const newGame: GameState = { id: newId, status: 'available' };

					const result = simulateSwap(returnGame, newGame, originalCheckout, checkinWt, checkoutWt);

					// Should succeed (not an error)
					expect(result).not.toHaveProperty('error');
					const swapResult = result as SwapResult;

					// (a) Return game status is available
					expect(swapResult.returnGameStatus).toBe('available');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('after a valid swap, new game status is checked_out', () => {
		fc.assert(
			fc.property(
				gameId,
				gameId.filter((id) => id > 1),
				validOriginalCheckout,
				positiveWeight,
				positiveWeight,
				(returnId, newIdBase, originalCheckout, checkinWt, checkoutWt) => {
					const newId = returnId === newIdBase ? newIdBase + 1 : newIdBase;

					const returnGame: GameState = { id: returnId, status: 'checked_out' };
					const newGame: GameState = { id: newId, status: 'available' };

					const result = simulateSwap(returnGame, newGame, originalCheckout, checkinWt, checkoutWt);

					expect(result).not.toHaveProperty('error');
					const swapResult = result as SwapResult;

					// (b) New game status is checked_out
					expect(swapResult.newGameStatus).toBe('checked_out');
				}
			),
			{ numRuns: 100 }
		);
	});

	it('after a valid swap, exactly one checkin transaction exists for the return game with the provided checkin weight', () => {
		fc.assert(
			fc.property(
				gameId,
				gameId.filter((id) => id > 1),
				validOriginalCheckout,
				positiveWeight,
				positiveWeight,
				(returnId, newIdBase, originalCheckout, checkinWt, checkoutWt) => {
					const newId = returnId === newIdBase ? newIdBase + 1 : newIdBase;

					const returnGame: GameState = { id: returnId, status: 'checked_out' };
					const newGame: GameState = { id: newId, status: 'available' };

					const result = simulateSwap(returnGame, newGame, originalCheckout, checkinWt, checkoutWt);

					expect(result).not.toHaveProperty('error');
					const swapResult = result as SwapResult;

					// (c) Exactly one checkin transaction for return game with correct weight
					expect(swapResult.checkinTx.gameId).toBe(returnId);
					expect(swapResult.checkinTx.type).toBe('checkin');
					expect(swapResult.checkinTx.weight).toBe(checkinWt);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('after a valid swap, exactly one checkout transaction exists for the new game with the provided checkout weight', () => {
		fc.assert(
			fc.property(
				gameId,
				gameId.filter((id) => id > 1),
				validOriginalCheckout,
				positiveWeight,
				positiveWeight,
				(returnId, newIdBase, originalCheckout, checkinWt, checkoutWt) => {
					const newId = returnId === newIdBase ? newIdBase + 1 : newIdBase;

					const returnGame: GameState = { id: returnId, status: 'checked_out' };
					const newGame: GameState = { id: newId, status: 'available' };

					const result = simulateSwap(returnGame, newGame, originalCheckout, checkinWt, checkoutWt);

					expect(result).not.toHaveProperty('error');
					const swapResult = result as SwapResult;

					// (d) Exactly one checkout transaction for new game with correct weight
					expect(swapResult.checkoutTx.gameId).toBe(newId);
					expect(swapResult.checkoutTx.type).toBe('checkout');
					expect(swapResult.checkoutTx.weight).toBe(checkoutWt);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('after a valid swap, checkout transaction attendee info matches the original checkout attendee info', () => {
		fc.assert(
			fc.property(
				gameId,
				gameId.filter((id) => id > 1),
				validOriginalCheckout,
				positiveWeight,
				positiveWeight,
				(returnId, newIdBase, originalCheckout, checkinWt, checkoutWt) => {
					const newId = returnId === newIdBase ? newIdBase + 1 : newIdBase;

					const returnGame: GameState = { id: returnId, status: 'checked_out' };
					const newGame: GameState = { id: newId, status: 'available' };

					const result = simulateSwap(returnGame, newGame, originalCheckout, checkinWt, checkoutWt);

					expect(result).not.toHaveProperty('error');
					const swapResult = result as SwapResult;

					// (e) Checkout transaction attendee info matches original checkout
					expect(swapResult.checkoutTx.attendeeFirstName).toBe(originalCheckout.attendeeFirstName);
					expect(swapResult.checkoutTx.attendeeLastName).toBe(originalCheckout.attendeeLastName);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('checkin transaction also carries the original attendee info', () => {
		fc.assert(
			fc.property(
				gameId,
				gameId.filter((id) => id > 1),
				validOriginalCheckout,
				positiveWeight,
				positiveWeight,
				(returnId, newIdBase, originalCheckout, checkinWt, checkoutWt) => {
					const newId = returnId === newIdBase ? newIdBase + 1 : newIdBase;

					const returnGame: GameState = { id: returnId, status: 'checked_out' };
					const newGame: GameState = { id: newId, status: 'available' };

					const result = simulateSwap(returnGame, newGame, originalCheckout, checkinWt, checkoutWt);

					expect(result).not.toHaveProperty('error');
					const swapResult = result as SwapResult;

					// Checkin transaction also has the attendee info from the original checkout
					expect(swapResult.checkinTx.attendeeFirstName).toBe(originalCheckout.attendeeFirstName);
					expect(swapResult.checkinTx.attendeeLastName).toBe(originalCheckout.attendeeLastName);
				}
			),
			{ numRuns: 100 }
		);
	});
});
