# Implementation Plan: Game Deletion

## Overview

This plan implements permanent game deletion from the game detail page. The work is broken into incremental steps: service layer methods first, then WebSocket event support, then the page server action, then the UI components, and finally the success toast on the games list page. Tests are interleaved close to the code they validate.

## Tasks

- [x] 1. Add service layer methods for game deletion
  - [x] 1.1 Add `getTransactionCount(gameId)` method to `gameService` in `src/lib/server/services/games.ts`
    - Query `transactions` table with `count()` where `gameId` matches
    - Return the count as a number (0 if no transactions)
    - _Requirements: 5.1, 5.2_

  - [x] 1.2 Add `delete(id)` method to `gameService` in `src/lib/server/services/games.ts`
    - Wrap in `db.transaction()` for atomicity
    - Select the game row; throw `'Game not found'` if missing
    - Throw `'Cannot delete a checked-out game'` if `status === 'checked_out'`
    - Delete all rows from `transactions` where `gameId = id`
    - Delete the game row from `games` where `id = id`
    - _Requirements: 4.1, 4.2, 4.3, 8.2, 8.3_

  - [x] 1.3 Write property-based tests for game deletion service logic
    - Create file `tests/properties/game-deletion.prop.test.ts`
    - **Property 1: Complete deletion removes game and all transactions**
    - **Validates: Requirements 4.1, 4.2**
    - **Property 2: Transaction count accuracy**
    - **Validates: Requirements 5.1, 5.2**
    - **Property 3: Checked-out game deletion guard**
    - **Validates: Requirements 8.3**

- [x] 2. Add `game_deleted` WebSocket event type
  - [x] 2.1 Update `src/lib/server/ws/events.ts` to add `game_deleted` to the `EventType` union
    - Add `'game_deleted'` to the `EventType` union type
    - It will automatically be included in `GameEventMessage` via the `Exclude` pattern
    - _Requirements: 7.1, 7.2_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update game detail page server to support deletion
  - [x] 4.1 Add `transactionCount` to the `load` function in `src/routes/management/games/[id]/+page.server.ts`
    - Call `gameService.getTransactionCount(id)` after fetching the game
    - Return `{ game, transactionCount }` from the load function
    - _Requirements: 5.1, 5.2_

  - [x] 4.2 Add `delete` form action to `src/routes/management/games/[id]/+page.server.ts`
    - Import `configService` and `authService`
    - If `passwordHash` is set, verify the submitted `confirmPassword` field; return `fail(400, { deleteError })` on mismatch
    - Call `gameService.delete(id)`
    - Call `broadcastGameEvent('game_deleted', id)` on success
    - Redirect to `/management/games?deleted=1` with status 303
    - Handle errors: not-found → 404, checked-out → 400, other → 500
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.4, 7.1, 8.1, 8.2, 8.3_

- [x] 5. Update game detail page component with delete UI
  - [x] 5.1 Add delete button and confirmation dialog to `src/routes/management/games/[id]/+page.svelte`
    - Add a "Danger Zone" section below the Status Override section with a delete button
    - Disable the delete button and show explanatory message when `data.game.status === 'checked_out'`
    - Style the delete button as visually distinct (red/danger styling) from edit and toggle controls
    - Build a custom `<dialog>` element for the deletion confirmation (same pattern as backup restore dialog)
    - Show warning about permanent deletion of game and transactions
    - Display transaction count: different message for 0 vs >0 transactions
    - Conditionally show password input field when `isPasswordSet` is true (from `$page.data`)
    - Disable confirm button when password is required but field is empty
    - On confirm, submit a hidden form via `POST ?/delete` with the password value
    - Show `deleteError` as a toast notification if the action returns an error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.5_

- [x] 6. Add success toast on games list page after deletion redirect
  - [x] 6.1 Update `src/routes/management/games/+page.svelte` to detect `?deleted=1` query param
    - On mount, check for `deleted=1` in the URL search params
    - Show a success toast (e.g., "Game deleted successfully")
    - Strip the `?deleted=1` param from the URL using `goto` with `replaceState: true` to prevent re-showing on refresh
    - _Requirements: 4.4, 4.5_

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Write E2E integration tests
  - [x] 8.1 Create `tests/integration/game-deletion.test.ts` with full deletion lifecycle test
    - Create a game via `helpers.createGame()`
    - Check out the game via `helpers.checkoutGame()`
    - Navigate to the game detail page and verify the delete button is disabled with an explanatory message
    - Check in the game via `helpers.checkinGame()`
    - Navigate back to the game detail page and click the delete button
    - Verify the confirmation dialog opens with the correct transaction count (2 — one checkout, one checkin)
    - Confirm the deletion
    - Verify redirect to the games list page
    - Verify the success toast is shown
    - Verify the game no longer appears in the games list
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.2, 2.3, 4.4, 4.5_

  - [x] 8.2 Add password prompt test to `tests/integration/password-protection.test.ts`
    - Add a new `test.describe` block for "Game deletion confirmation"
    - Set a management password
    - Navigate to a game detail page
    - Click the delete button
    - Verify the password input field appears in the confirmation dialog
    - Verify the confirm button is disabled when password field is empty
    - Clean up: close dialog and remove password
    - _Requirements: 3.1, 3.2_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the three correctness properties from the design document against a real PostgreSQL database
- The custom dialog pattern follows the existing backup restore dialog implementation
- The `game_deleted` WebSocket event uses the existing `broadcastGameEvent` function since it follows the `GameEventMessage` shape
