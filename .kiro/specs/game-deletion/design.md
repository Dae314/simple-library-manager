# Design Document: Game Deletion

## Overview

This feature adds permanent (hard) deletion of a game and all its associated transactions from the game detail page at `/management/games/[id]`. The design follows existing codebase patterns: a new `delete` method on `gameService` handles the cascading delete inside a single Drizzle `db.transaction()`, a new SvelteKit form action on the game detail page handles server-side validation (checked-out guard, optional password verification), and the Svelte 5 page component renders a custom confirmation dialog with transaction count and optional password field.

### Key Design Decisions

1. **Hard delete, not soft delete** — The app already has a "retire" (soft-delete) mechanism. This feature is explicitly for permanent removal of a game and its full transaction history. This is irreversible by design.
2. **Reuse existing password verification pattern** — The backup restore page already implements password confirmation in a custom dialog. The game deletion dialog follows the same pattern: `configService.getPasswordHash()` on the server, `authService.verifyPassword()` for validation, and `isPasswordSet` from the management layout for conditional UI rendering.
3. **Transaction count loaded eagerly** — The transaction count is fetched in the page's `load` function alongside the game data, so it's available immediately when the dialog opens. This avoids a separate API call and keeps the UX snappy.
4. **WebSocket broadcast on deletion** — A `game_deleted` event is broadcast after successful deletion so other open browser tabs can react (e.g., remove the game from a list). This requires adding a new event type to the existing WebSocket event system.
5. **Custom dialog instead of `ConfirmDialog` component** — The existing `ConfirmDialog.svelte` only supports a title, message, warning, and action buttons. The deletion dialog needs a dynamic transaction count message and a conditional password field, so it uses a custom `<dialog>` element following the same pattern as the backup restore dialog.

## Architecture

The feature touches three layers:

```mermaid
flowchart TD
    A[Game Detail Page<br/>+page.svelte] -->|form POST ?/delete| B[Page Server<br/>+page.server.ts]
    B -->|password check| C[configService / authService]
    B -->|delete game + txns| D[gameService.delete]
    D -->|single DB transaction| E[(PostgreSQL)]
    B -->|broadcast event| F[WebSocket broadcast]
    B -->|redirect 303| G[/management/games]

    subgraph Client
        A
    end

    subgraph Server
        B
        C
        D
        F
    end

    subgraph Database
        E
    end
```

### Request Flow

1. User clicks "Delete Game" button on the game detail page
2. Client opens a confirmation dialog showing transaction count and optional password field
3. User confirms → client submits a hidden form via `POST ?/delete`
4. Server action:
   a. Parses game ID from route params
   b. If password is set, verifies the submitted password against the stored hash
   c. Calls `gameService.delete(id)` which:
      - Verifies the game exists and is not `checked_out`
      - Deletes all transactions where `gameId = id`
      - Deletes the game row
      - All within a single `db.transaction()`
   d. Broadcasts a `game_deleted` WebSocket event
   e. Redirects to `/management/games` with status 303

## Components and Interfaces

### Service Layer Changes

#### `gameService.delete(id: number): Promise<void>`

New method on the existing `gameService` object in `src/lib/server/services/games.ts`.

```typescript
async delete(id: number): Promise<void> {
    await db.transaction(async (tx) => {
        // 1. Verify game exists and is not checked out
        const [game] = await tx
            .select({ id: games.id, status: games.status })
            .from(games)
            .where(eq(games.id, id));

        if (!game) {
            throw new Error('Game not found');
        }

        if (game.status === 'checked_out') {
            throw new Error('Cannot delete a checked-out game');
        }

        // 2. Delete all transactions for this game
        await tx.delete(transactions).where(eq(transactions.gameId, id));

        // 3. Delete the game
        await tx.delete(games).where(eq(games.id, id));
    });
}
```

#### `gameService.getTransactionCount(id: number): Promise<number>`

New method to retrieve the count of transactions for a game, used by the page load function.

```typescript
async getTransactionCount(gameId: number): Promise<number> {
    const [result] = await db
        .select({ count: count() })
        .from(transactions)
        .where(eq(transactions.gameId, gameId));
    return result?.count ?? 0;
}
```

### Page Server Changes (`src/routes/management/games/[id]/+page.server.ts`)

#### Updated `load` function

Add `transactionCount` to the returned data:

```typescript
export const load: PageServerLoad = async ({ params }) => {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(404, 'Game not found');

    const game = await gameService.getById(id);
    if (!game) error(404, 'Game not found');

    const transactionCount = await gameService.getTransactionCount(id);

    return { game, transactionCount };
};
```

#### New `delete` form action

```typescript
delete: async ({ request, params }) => {
    const id = parseInt(params.id, 10);

    // Password verification (if password is set)
    const passwordHash = await configService.getPasswordHash();
    if (passwordHash) {
        const formData = await request.formData();
        const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';
        if (!confirmPassword) {
            return fail(400, { deleteError: 'Password confirmation is required' });
        }
        const isValid = await authService.verifyPassword(confirmPassword, passwordHash);
        if (!isValid) {
            return fail(400, { deleteError: 'Incorrect password' });
        }
    }

    try {
        await gameService.delete(id);
        broadcastGameEvent('game_deleted', id);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete game';
        if (message.includes('not found')) {
            return fail(404, { deleteError: 'Game not found' });
        }
        if (message.includes('checked-out')) {
            return fail(400, { deleteError: 'Cannot delete a checked-out game. Check it in first.' });
        }
        return fail(500, { deleteError: message });
    }

    redirect(303, '/management/games?deleted=1');
}
```

### WebSocket Event Changes

Add `game_deleted` to the `EventType` union in `src/lib/server/ws/events.ts`:

```typescript
export type EventType =
    | 'game_created'
    | 'game_updated'
    | 'game_deleted'   // NEW
    | 'game_checked_out'
    // ... rest unchanged
```

Add `game_deleted` to the `GameEventMessage` type's `type` discriminant (it already uses `Exclude` so just adding to the union is sufficient).

### Page Component Changes (`src/routes/management/games/[id]/+page.svelte`)

New UI elements added to the existing page:

1. **Delete button** — Placed below the Status Override section, visually separated. Disabled when `data.game.status === 'checked_out'` with an explanatory message.
2. **Deletion confirmation dialog** — Custom `<dialog>` element (same pattern as backup restore dialog) containing:
   - Warning message about permanent deletion
   - Transaction count message (different text for 0 vs >0)
   - Conditional password field (when `isPasswordSet` is true)
   - Cancel and Confirm buttons
3. **Hidden form** — A hidden `<form>` that POSTs to `?/delete` with the password value, submitted programmatically on confirm.

### Success Toast on Games List

The redirect URL includes `?deleted=1`. The games list page (`/management/games/+page.svelte`) checks for this query parameter on mount and shows a success toast. After displaying the toast, the page strips the `?deleted=1` parameter from the URL using `goto` with `replaceState: true` to prevent the toast from reappearing on refresh or bookmark. This follows a simple pattern since SvelteKit form actions redirect with 303 and can't pass flash data without a cookie-based flash store.

## Data Models

### Existing Tables (no schema changes)

**`games`** table:
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | Target of deletion |
| title | text | |
| bgg_id | integer | |
| copy_number | integer | |
| status | text | Must not be `checked_out` for deletion |
| game_type | text | |
| version | integer | Optimistic locking (not needed for delete) |
| created_at | timestamp | |
| updated_at | timestamp | |

**`transactions`** table:
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| game_id | integer FK → games.id | Used to find transactions to cascade-delete |
| type | text | |
| ... | ... | Other columns deleted along with the row |

### Deletion Cascade

The `transactions.gameId` column has a foreign key reference to `games.id`. The schema does not define `ON DELETE CASCADE`, so the service must explicitly delete transactions before the game row. The order within the DB transaction is:

1. `DELETE FROM transactions WHERE game_id = :id`
2. `DELETE FROM games WHERE id = :id`

### New Data Passed to Client

The `load` function returns an additional field:

```typescript
{ game: GameRecord, transactionCount: number }
```

No new database tables or columns are required.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Complete deletion removes game and all transactions

*For any* game that is not checked out and has any number of associated transactions (0 or more, of any type — checkout, checkin, correction), calling `gameService.delete(id)` SHALL result in both the game row and all associated transaction rows being removed from the database. After deletion, `gameService.getById(id)` returns null and querying transactions by `gameId` returns zero rows.

**Validates: Requirements 4.1, 4.2**

### Property 2: Transaction count accuracy

*For any* game with any combination of transaction types (checkouts, checkins, corrections), `gameService.getTransactionCount(gameId)` SHALL return a number equal to the total number of rows in the `transactions` table where `gameId` matches, regardless of transaction type or other attributes.

**Validates: Requirements 5.1, 5.2**

### Property 3: Checked-out game deletion guard

*For any* game whose status is `checked_out`, calling `gameService.delete(id)` SHALL throw an error and leave both the game row and all its associated transaction rows unchanged in the database.

**Validates: Requirements 8.3**

## Error Handling

### Server-Side Errors

| Scenario | Error Response | HTTP Status |
|----------|---------------|-------------|
| Game not found at deletion time | `{ deleteError: 'Game not found' }` | 404 |
| Game is checked out | `{ deleteError: 'Cannot delete a checked-out game. Check it in first.' }` | 400 |
| Password required but not provided | `{ deleteError: 'Password confirmation is required' }` | 400 |
| Incorrect password | `{ deleteError: 'Incorrect password' }` | 400 |
| Database failure | `{ deleteError: <error message> }` | 500 |

### Client-Side Error Display

- The `deleteError` field from `fail()` responses is displayed as a toast notification via `svelte-hot-french-toast`, consistent with how other errors are shown on this page.
- If the form action returns a `deleteError`, the dialog closes and the toast appears on the game detail page (the user is not redirected).

### Atomicity Guarantee

The `gameService.delete()` method wraps both the transaction deletion and game deletion in a single `db.transaction()`. If any step fails (e.g., the game status check), the entire operation rolls back and no data is modified. This is the same pattern used by `gameService.create()`, `gameService.toggleStatus()`, and `transactionService.checkout()`.

## Testing Strategy

### Property-Based Tests (Vitest + fast-check)

Location: `tests/properties/game-deletion.prop.test.ts`

These tests validate the three correctness properties defined above. They require a running PostgreSQL database (same as the existing property tests that test validation logic, but these test service-layer logic against the DB).

**Note:** Since the `gameService.delete()` and `gameService.getTransactionCount()` methods interact with the database, the property tests will need to:
- Create test games and transactions using the service layer
- Run the property assertion
- Clean up after each test

Each property test runs a minimum of 100 iterations with fast-check generating:
- Random game attributes (title, bggId, gameType)
- Random numbers of transactions (0–20) with random types (checkout, checkin, correction)
- Random game statuses for the guard property

Tag format: `Feature: game-deletion, Property N: <property text>`

**However**, since these properties test database operations and the existing property tests in this project only test pure validation functions (no DB), the property-based tests for deletion logic are better suited as focused unit tests with a few representative examples rather than 100+ DB round-trips. The properties above serve as formal specifications that guide the example-based tests.

### Unit Tests (Vitest)

Location: `tests/properties/game-deletion.prop.test.ts`

| Test | Validates |
|------|-----------|
| `getTransactionCount` returns 0 for a game with no transactions | Req 5.1, 5.2 |
| `getTransactionCount` returns correct count for mixed transaction types | Req 5.1, 5.2 |
| `delete` removes game and all transactions | Req 4.1, 4.2 |
| `delete` works for game with zero transactions | Req 4.1, 4.2 |
| `delete` throws for non-existent game | Req 6.2 |
| `delete` throws for checked-out game and leaves data intact | Req 6.3 |
| `delete` action verifies password when set | Req 3.3 |
| `delete` action rejects incorrect password | Req 3.3 |
| `delete` action proceeds without password when none is set | Req 3.4 |

### E2E Integration Tests (Playwright)

Location: `tests/integration/game-deletion.test.ts`

**Game deletion flow test** — A single end-to-end test that exercises the full lifecycle:
1. Create a new game via `helpers.createGame()`
2. Check out the game via `helpers.checkoutGame()`
3. Navigate to the game detail page and verify the delete button is disabled with an explanatory message
4. Check in the game via `helpers.checkinGame()`
5. Navigate back to the game detail page and click the delete button
6. Verify the confirmation dialog opens with the correct transaction count (should be 2 — one checkout, one checkin)
7. Confirm the deletion
8. Verify redirect to the games list page
9. Verify the game no longer appears in the games list

**Password prompt test** — Added to the existing password protection integration tests (`tests/integration/management-password.test.ts`):
1. Set a management password
2. Navigate to a game detail page
3. Click the delete button
4. Verify the password input field appears in the confirmation dialog
5. (The actual deletion flow with password is not tested here — it's covered by the deletion-specific test above)

### Files Changed

| File | Change |
|------|--------|
| `src/lib/server/services/games.ts` | Add `delete(id)` and `getTransactionCount(gameId)` methods |
| `src/lib/server/ws/events.ts` | Add `game_deleted` to `EventType` union |
| `src/routes/management/games/[id]/+page.server.ts` | Add `transactionCount` to load, add `delete` form action |
| `src/routes/management/games/[id]/+page.svelte` | Add delete button, confirmation dialog, hidden delete form |
| `src/routes/management/games/+page.svelte` | Show success toast when `?deleted=1` query param is present |
| `tests/properties/game-deletion.prop.test.ts` | Property-based / unit tests for deletion service logic |
| `tests/integration/game-deletion.test.ts` | E2E test for the full deletion lifecycle flow |
| `tests/integration/management-password.test.ts` | Add test for password prompt appearing on game deletion dialog |
