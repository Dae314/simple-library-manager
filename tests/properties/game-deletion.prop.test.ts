import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Game Deletion Service — Property-Based Tests (Example-Based)
 *
 * These tests validate the three correctness properties from the design document
 * for game deletion service logic. Since the service methods interact with the
 * database and the existing property tests in this project only test pure
 * validation functions, these are written as focused example-based unit tests
 * that mock the database layer.
 *
 * The properties serve as formal specifications guiding these tests.
 */

// --- Mock setup ---

// Track all DB operations for assertions
let mockDbOperations: Array<{ op: string; table?: string; where?: unknown; data?: unknown }> = [];

// Configurable mock data per test
let mockGameRows: Array<{ id: number; status: string }> = [];
let mockTransactionCountRows: Array<{ count: number }> = [];

// Build a chainable query builder mock
function createChainableMock(terminalValue: unknown) {
	const chain: Record<string, ReturnType<typeof vi.fn>> = {};
	const handler: ProxyHandler<Record<string, ReturnType<typeof vi.fn>>> = {
		get(_target, prop: string) {
			if (prop === 'then') return undefined; // Not a thenable
			if (!chain[prop]) {
				chain[prop] = vi.fn().mockReturnValue(new Proxy({}, handler));
			}
			return chain[prop];
		}
	};
	return new Proxy({}, handler);
}

// Create a mock transaction object that tracks operations
function createMockTx() {
	const deletedTables: string[] = [];
	const selectedData: Map<string, unknown[]> = new Map();

	// Pre-populate what select queries should return
	selectedData.set('games', mockGameRows);

	const tx = {
		select: vi.fn().mockImplementation((_fields?: unknown) => {
			let fromTable = '';
			return {
				from: vi.fn().mockImplementation((table: unknown) => {
					// Determine table name from the table reference
					fromTable = table === gamesTable ? 'games' : 'transactions';
					return {
						where: vi.fn().mockImplementation((_condition: unknown) => {
							mockDbOperations.push({ op: 'select', table: fromTable });
							if (fromTable === 'games') {
								return Promise.resolve(mockGameRows);
							}
							return Promise.resolve(mockTransactionCountRows);
						})
					};
				})
			};
		}),
		delete: vi.fn().mockImplementation((table: unknown) => {
			const tableName = table === gamesTable ? 'games' : 'transactions';
			return {
				where: vi.fn().mockImplementation((_condition: unknown) => {
					deletedTables.push(tableName);
					mockDbOperations.push({ op: 'delete', table: tableName });
					return Promise.resolve();
				})
			};
		}),
		_deletedTables: deletedTables
	};

	return tx;
}

// Table references for identity comparison in mocks
let gamesTable: unknown;
let transactionsTable: unknown;

// Mock the database module
vi.mock('$lib/server/db/index.js', () => {
	const mockDb = {
		select: vi.fn().mockImplementation((_fields?: unknown) => {
			return {
				from: vi.fn().mockImplementation((table: unknown) => {
					const tableName = table === gamesTable ? 'games' : 'transactions';
					return {
						where: vi.fn().mockImplementation((_condition: unknown) => {
							mockDbOperations.push({ op: 'select', table: tableName });
							if (tableName === 'transactions') {
								return Promise.resolve(mockTransactionCountRows);
							}
							return Promise.resolve(mockGameRows);
						})
					};
				})
			};
		}),
		transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
			const tx = createMockTx();
			return await callback(tx);
		})
	};
	return { db: mockDb };
});

// Import after mocking
const schemaModule = await import('$lib/server/db/schema.js');
gamesTable = schemaModule.games;
transactionsTable = schemaModule.transactions;

const { gameService } = await import('$lib/server/services/games.js');

beforeEach(() => {
	mockDbOperations = [];
	mockGameRows = [];
	mockTransactionCountRows = [];
	vi.clearAllMocks();
});

/**
 * Property 1: Complete deletion removes game and all transactions
 *
 * For any game that is not checked out and has any number of associated
 * transactions (0 or more, of any type — checkout, checkin, correction),
 * calling `gameService.delete(id)` SHALL result in both the game row and
 * all associated transaction rows being removed from the database.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Property 1: Complete deletion removes game and all transactions', () => {
	it('deletes both transactions and game for an available game with transactions', async () => {
		mockGameRows = [{ id: 42, status: 'available' }];

		await gameService.delete(42);

		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		expect(deleteOps).toHaveLength(2);
		expect(deleteOps[0].table).toBe('transactions');
		expect(deleteOps[1].table).toBe('games');
	});

	it('deletes both transactions and game for a retired game', async () => {
		mockGameRows = [{ id: 10, status: 'retired' }];

		await gameService.delete(10);

		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		expect(deleteOps).toHaveLength(2);
		expect(deleteOps[0].table).toBe('transactions');
		expect(deleteOps[1].table).toBe('games');
	});

	it('deletes transactions before the game (correct ordering for FK constraint)', async () => {
		mockGameRows = [{ id: 7, status: 'available' }];

		await gameService.delete(7);

		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		// Transactions must be deleted first due to foreign key constraint
		expect(deleteOps[0].table).toBe('transactions');
		expect(deleteOps[1].table).toBe('games');
	});

	it('deletes game even when it has zero transactions', async () => {
		mockGameRows = [{ id: 99, status: 'available' }];

		await gameService.delete(99);

		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		// Both delete operations still execute (transactions delete is a no-op for 0 rows)
		expect(deleteOps).toHaveLength(2);
		expect(deleteOps[0].table).toBe('transactions');
		expect(deleteOps[1].table).toBe('games');
	});

	it('throws when game does not exist', async () => {
		mockGameRows = []; // No game found

		await expect(gameService.delete(999)).rejects.toThrow('Game not found');

		// No delete operations should have occurred
		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		expect(deleteOps).toHaveLength(0);
	});
});

/**
 * Property 2: Transaction count accuracy
 *
 * For any game with any combination of transaction types (checkouts, checkins,
 * corrections), `gameService.getTransactionCount(gameId)` SHALL return a number
 * equal to the total number of rows in the `transactions` table where `gameId`
 * matches, regardless of transaction type or other attributes.
 *
 * **Validates: Requirements 5.1, 5.2**
 */
describe('Property 2: Transaction count accuracy', () => {
	it('returns 0 for a game with no transactions', async () => {
		mockTransactionCountRows = [{ count: 0 }];

		const result = await gameService.getTransactionCount(1);

		expect(result).toBe(0);
	});

	it('returns correct count for a game with multiple transactions', async () => {
		mockTransactionCountRows = [{ count: 5 }];

		const result = await gameService.getTransactionCount(42);

		expect(result).toBe(5);
	});

	it('returns correct count for a game with a single transaction', async () => {
		mockTransactionCountRows = [{ count: 1 }];

		const result = await gameService.getTransactionCount(10);

		expect(result).toBe(1);
	});

	it('returns count reflecting all transaction types (checkout, checkin, correction)', async () => {
		// 3 checkouts + 3 checkins + 2 corrections = 8 total
		mockTransactionCountRows = [{ count: 8 }];

		const result = await gameService.getTransactionCount(7);

		expect(result).toBe(8);
	});
});

/**
 * Property 3: Checked-out game deletion guard
 *
 * For any game whose status is `checked_out`, calling `gameService.delete(id)`
 * SHALL throw an error and leave both the game row and all its associated
 * transaction rows unchanged in the database.
 *
 * **Validates: Requirements 8.3**
 */
describe('Property 3: Checked-out game deletion guard', () => {
	it('throws error when attempting to delete a checked-out game', async () => {
		mockGameRows = [{ id: 42, status: 'checked_out' }];

		await expect(gameService.delete(42)).rejects.toThrow('Cannot delete a checked-out game');
	});

	it('does not delete any data when game is checked out', async () => {
		mockGameRows = [{ id: 42, status: 'checked_out' }];

		try {
			await gameService.delete(42);
		} catch {
			// Expected to throw
		}

		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		expect(deleteOps).toHaveLength(0);
	});

	it('allows deletion of available games (guard only blocks checked_out)', async () => {
		mockGameRows = [{ id: 42, status: 'available' }];

		await gameService.delete(42);

		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		expect(deleteOps).toHaveLength(2);
	});

	it('allows deletion of retired games (guard only blocks checked_out)', async () => {
		mockGameRows = [{ id: 42, status: 'retired' }];

		await gameService.delete(42);

		const deleteOps = mockDbOperations.filter((op) => op.op === 'delete');
		expect(deleteOps).toHaveLength(2);
	});
});
