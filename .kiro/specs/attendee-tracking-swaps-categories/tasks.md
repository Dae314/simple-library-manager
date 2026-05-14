# Implementation Plan: Attendee Tracking, Swaps & Categories

## Overview

This plan implements four major capabilities: attendee persistence with autofill, atomic game swap action, shelf category classification, and the gameType→prizeType rename. Tasks are ordered to build foundational schema and services first, then layer UI components and tests on top.

## Tasks

- [x] 1. Database schema changes and migrations
  - [x] 1.1 Rename gameType column to prizeType in schema and generate migration
    - Edit `src/lib/server/db/schema.ts`: rename `gameType` field to `prizeType`, rename index from `idx_games_game_type` to `idx_games_prize_type`
    - Run `npm run db:generate` to create migration SQL that renames the column
    - _Requirements: 5.1, 5.2_

  - [x] 1.2 Add attendees table, shelfCategory column, and attendeeId FK to schema and generate migration
    - Add `attendees` table definition with id, firstName, lastName, idType, createdAt, updatedAt
    - Add unique index on `LOWER(TRIM(first_name)), LOWER(TRIM(last_name))`
    - Add `shelfCategory` column to games table with default `'standard'` and index
    - Add `attendeeId` column to transactions table with FK to attendees (onDelete cascade) and index
    - Run `npm run db:generate` to create migration SQL
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.3_

- [x] 2. Update validation module
  - [x] 2.1 Add attendee input validation and update game validation for prizeType rename and shelfCategory
    - Add `validateAttendeeInput` function: firstName/lastName max 100 chars, required, trimmed; idType required
    - Add `validateSwapInput` function: returnGameId/newGameId required integers, checkinWeight/checkoutWeight positive finite numbers > 0
    - Update `validateGameInput` to rename `gameType` to `prizeType` and add optional `shelfCategory` field (must be one of `family`, `small`, `standard`)
    - Update `validateCsvRows` to support `shelfCategory` column and accept both `prizeType` and `gameType` headers
    - _Requirements: 1.1, 3.5, 4.4, 4.5, 4.9, 4.11, 5.2, 5.5_

  - [x] 2.2 Write property tests for attendee name validation (Property 1)
    - **Property 1: Attendee name length validation**
    - **Validates: Requirements 1.1**
    - File: `tests/properties/attendee-validation.prop.test.ts`

  - [x] 2.3 Write property tests for swap weight validation (Property 5)
    - **Property 5: Swap weight validation**
    - **Validates: Requirements 3.5**
    - File: `tests/properties/swap-validation.prop.test.ts`

  - [x] 2.4 Write property tests for shelf category validation (Property 8)
    - **Property 8: Shelf category validation**
    - **Validates: Requirements 4.1, 4.4, 4.5**
    - File: `tests/properties/shelf-category.prop.test.ts`

  - [x] 2.5 Write property tests for CSV shelfCategory round-trip and prizeType/gameType backward compatibility (Properties 10, 11)
    - **Property 10: CSV shelf category round-trip**
    - **Property 11: CSV prizeType/gameType backward compatibility**
    - **Validates: Requirements 4.10, 4.11, 4.12, 5.5**
    - File: `tests/properties/csv-shelf-category.prop.test.ts`

- [x] 3. Checkpoint - Ensure schema and validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement attendee service
  - [x] 4.1 Create attendee service with CRUD, upsert, and search methods
    - Create `src/lib/server/services/attendees.ts`
    - Implement `upsert`: case-insensitive match on trimmed first+last name, create or update idType, return attendee ID
    - Implement `searchByPrefix`: case-insensitive prefix match on specified field, max 10 results, min 2-char query
    - Implement `list`: filters (search, idType), pagination, sorting (first_name, last_name, id_type, transaction_count)
    - Implement `getById`, `update` (with uniqueness check), `delete` (reject if active checkouts, cascade transactions)
    - Implement `getTransactionCount` and `hasActiveCheckouts`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.3, 9.2, 9.3, 9.6, 9.9, 9.11, 9.12_

  - [x] 4.2 Write property tests for attendee upsert correctness (Property 2)
    - **Property 2: Attendee upsert correctness (case-insensitive create-or-update)**
    - **Validates: Requirements 1.2, 1.4, 1.5**
    - File: `tests/properties/attendee-validation.prop.test.ts`

  - [x] 4.3 Write property tests for autofill prefix matching (Property 4)
    - **Property 4: Autofill prefix matching**
    - **Validates: Requirements 2.3**
    - File: `tests/properties/attendee-search.prop.test.ts`

  - [x] 4.4 Write property tests for attendee search partial matching (Property 15)
    - **Property 15: Attendee search partial matching**
    - **Validates: Requirements 9.3**
    - File: `tests/properties/attendee-search.prop.test.ts`

  - [x] 4.5 Write property tests for attendee edit uniqueness validation (Property 16)
    - **Property 16: Attendee edit uniqueness validation**
    - **Validates: Requirements 9.9**
    - File: `tests/properties/attendee-validation.prop.test.ts`

  - [x] 4.6 Write property tests for attendee deletion blocked by active checkouts (Property 17)
    - **Property 17: Attendee deletion blocked by active checkouts**
    - **Validates: Requirements 9.11**
    - File: `tests/properties/attendee-validation.prop.test.ts`

- [x] 5. Update game service and transaction service
  - [x] 5.1 Update game service for prizeType rename and shelfCategory support
    - Rename all `gameType` references to `prizeType` in `src/lib/server/services/games.ts`
    - Add `shelfCategory` to `LibraryFilters` interface and filter logic
    - Add `'shelf_category'` to `LibrarySortParams.field`
    - Update `create` and `update` to accept and persist `shelfCategory`
    - Update CSV export to include `shelfCategory` column and use `prizeType` header
    - Update CSV import to handle `shelfCategory` column and accept `gameType` as legacy alias for `prizeType`
    - _Requirements: 4.1, 4.2, 4.6, 4.7, 4.8, 4.10, 4.11, 4.12, 4.13, 5.1, 5.2, 5.4, 5.5_

  - [x] 5.2 Add swap method to transaction service with attendee upsert integration
    - Add `swap` method to `src/lib/server/services/transactions.ts`
    - Validate return game is `checked_out` and new game is `available`
    - Execute in `db.transaction()`: checkin return game, checkout new game with same attendee info
    - Call `attendeeService.upsert` during the checkout portion (same as normal checkout)
    - Record standard `checkin` and `checkout` transactions with respective weights
    - Perform weight comparison on checkin using configured tolerance
    - Broadcast WebSocket events for both checkin and checkout
    - _Requirements: 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.14_

  - [x] 5.3 Integrate attendee upsert into existing checkout flow
    - Modify checkout method in transaction service to call `attendeeService.upsert` and store `attendeeId` on the transaction
    - Skip attendee upsert when `isCorrection` is true
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [x] 5.4 Write property tests for corrections skip attendee upsert (Property 3)
    - **Property 3: Corrections skip attendee upsert**
    - **Validates: Requirements 1.6**
    - File: `tests/properties/attendee-validation.prop.test.ts`

  - [x] 5.5 Write property tests for swap atomicity and correctness (Property 6)
    - **Property 6: Swap atomicity and correctness**
    - **Validates: Requirements 3.6, 3.7, 3.8**
    - File: `tests/properties/swap-validation.prop.test.ts`

  - [x] 5.6 Write property tests for swap precondition validation (Property 7)
    - **Property 7: Swap precondition validation**
    - **Validates: Requirements 3.10, 3.11**
    - File: `tests/properties/swap-validation.prop.test.ts`

  - [x] 5.7 Write property tests for shelf category filtering (Property 9)
    - **Property 9: Shelf category filtering**
    - **Validates: Requirements 4.8**
    - File: `tests/properties/shelf-category.prop.test.ts`

  - [x] 5.8 Write property tests for shelf category and prize type independence (Property 12)
    - **Property 12: Shelf category and prize type independence**
    - **Validates: Requirements 4.13**
    - File: `tests/properties/shelf-category.prop.test.ts`

- [x] 6. Checkpoint - Ensure all service-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. WebSocket events and broadcast helpers
  - [x] 7.1 Add attendee WebSocket event types and broadcast helper
    - Add `attendee_created`, `attendee_updated`, `attendee_deleted` to event types in `src/lib/server/ws/events.ts`
    - Add `broadcastAttendeeEvent` helper in `src/lib/server/ws/broadcast.ts`
    - Add `/management/attendees` to `LIVE_UPDATE_PAGES` array in the client WebSocket store
    - _Requirements: 9.13, 9.15_

- [x] 8. Update existing frontend references from gameType to prizeType
  - [x] 8.1 Rename gameType to prizeType across all frontend components, pages, and forms
    - Update `GameTypeBadge.svelte` component (or rename it to `PrizeTypeBadge.svelte`)
    - Update library page filters, management game forms, and any display logic
    - Update all form actions and load functions referencing `gameType`
    - Ensure user-facing labels remain "Standard", "Play & Win", "Play & Take"
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 8.2 Update existing property-based tests referencing gameType to use prizeType
    - Update `tests/properties/game-validation.prop.test.ts` and any other test files referencing `gameType`
    - _Requirements: 11.7_

- [x] 9. Implement shelf category UI
  - [x] 9.1 Add shelfCategory field to game creation and edit forms
    - Add select dropdown with options: Family, Small, Standard (default)
    - Update form actions in `src/routes/management/games/new/+page.server.ts` and `src/routes/management/games/[id]/+page.server.ts`
    - _Requirements: 4.6_

  - [x] 9.2 Add shelfCategory column display, filter, and sort to library and management pages
    - Add column to library page table and management games table with labels "Family", "Small", "Standard"
    - Add shelf category filter control to library page and management game list
    - Enable sorting by shelf category
    - _Requirements: 4.7, 4.8_

- [x] 10. Implement attendee autofill component and API endpoints
  - [x] 10.1 Create attendee search API endpoint and available games API endpoint
    - Create `src/routes/api/attendees/search/+server.ts`: GET with `q` and `field` params, returns max 10 suggestions, min 2-char query
    - Create `src/routes/api/games/available/+server.ts`: GET with `q`, `page`, `pageSize` params, returns paginated lightweight game records (id, title, bggId, copyNumber)
    - _Requirements: 2.1, 2.3, 3.2, 3.3_

  - [x] 10.2 Create AttendeeAutofill.svelte component
    - Implement typeahead with debounced fetch to `/api/attendees/search`
    - Show suggestions dropdown with max 10 results
    - On select, call `onSelect` callback with full attendee record
    - Suppress errors silently on service failure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 10.3 Integrate AttendeeAutofill into CheckoutDialog
    - Add autofill to first name and last name fields in `CheckoutDialog.svelte`
    - On suggestion select, populate firstName, lastName, and idType fields
    - _Requirements: 2.4_

  - [x] 10.4 Add attendee autofill to library page filter
    - Add attendee name filter with autofill suggestions on the library page
    - _Requirements: 2.7_

- [x] 11. Implement Swap Dialog
  - [x] 11.1 Create SwapDialog.svelte component
    - Accept `returnGame` prop (the checked-out game being returned)
    - Display attendee info (firstName, lastName, idType) as read-only from return game's checkout
    - Implement searchable paginated list of available games via `/api/games/available` endpoint
    - Add compact pagination for available games list
    - Add checkin weight and checkout weight input fields (positive numbers > 0)
    - Submit swap via form action
    - Display success toast on completion, weight warning if applicable
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.13, 3.14_

  - [x] 11.2 Add swap form action and wire Swap button on library page
    - Create swap form action in library page server (or appropriate route)
    - Call `transactionService.swap()` with validated input
    - Add "Swap" button next to "Check In" on checked-out game entries
    - _Requirements: 3.1, 3.6_

  - [x] 11.3 Implement swap conflict detection monitoring two game IDs
    - Extend `handleEvent` pattern in SwapDialog to check incoming WebSocket events against both returnGameId and selected newGameId
    - Show warning banner and disable submit on conflict
    - Auto-update available games list when games become available/unavailable
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 11.4 Write property tests for swap conflict detection (Property 13)
    - **Property 13: Swap conflict detection (two-game monitoring)**
    - **Validates: Requirements 6.2, 6.5**
    - File: `tests/properties/swap-conflict.prop.test.ts`

- [x] 12. Checkpoint - Ensure swap and autofill tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement attendee management pages
  - [x] 13.1 Create attendee management list page with search, filter, sort, and pagination
    - Create `src/routes/management/attendees/+page.svelte` and `+page.server.ts`
    - Display sortable table: firstName, lastName, idType, transactionCount
    - Add search input (case-insensitive partial match, max 100 chars)
    - Add ID type filter dropdown
    - Add pagination (default 10, selectable 10/25/50)
    - Default sort: lastName ascending
    - Add delete action with confirmation dialog showing cascade count
    - Block deletion if attendee has active checkouts
    - Add empty state message when no results
    - Add navigation link in management sidebar
    - Wire WebSocket live updates (invalidateAll on attendee events)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.10, 9.11, 9.12, 9.14, 9.15_

  - [x] 13.2 Create attendee edit page
    - Create `src/routes/management/attendees/[id]/+page.svelte` and `+page.server.ts`
    - Load attendee by ID, display edit form for firstName, lastName, idType
    - Validate uniqueness on save (reject if duplicate name combination exists)
    - Broadcast `attendee_updated` event on success
    - _Requirements: 9.8, 9.9, 9.13_

- [x] 14. Implement attendee statistics and transaction log filtering
  - [x] 14.1 Add attendee statistics section to statistics page
    - Add "Attendees with Most Checkouts" section to statistics page
    - Query top 10 attendees by non-correction checkout count
    - Display full name and checkout count in table format
    - Respect existing date range and filters
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 14.2 Write property tests for attendee statistics exclude corrections (Property 14)
    - **Property 14: Attendee statistics exclude corrections**
    - **Validates: Requirements 8.4**
    - File: `tests/properties/attendee-statistics.prop.test.ts`

  - [x] 14.3 Add attendee name filter to transactions management page
    - Add attendee name filter input with autofill suggestions
    - Filter transactions by attendee firstName or lastName (case-insensitive partial match)
    - Ensure filter works in combination with existing filters (game title, type, date range)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 15. Checkpoint - Ensure all unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. E2E integration tests
  - [x] 16.1 Write E2E tests for swap flow
    - Test full swap flow: open dialog, select game, enter weights, confirm
    - Test weight warning display
    - Test conflict detection via second browser context
    - File: `tests/integration/swap.test.ts`
    - _Requirements: 11.2_

  - [x] 16.2 Write E2E tests for attendee autofill
    - Test autofill on checkout dialog, library page filter, and transactions page filter
    - Test suggestion selection populates fields
    - Test no suggestions for < 2 chars
    - File: `tests/integration/attendee-autofill.test.ts`
    - _Requirements: 11.3_

  - [x] 16.3 Write E2E tests for attendee management
    - Test CRUD operations, search, delete with cascade confirmation
    - Test active checkout prevention on delete
    - File: `tests/integration/attendee-management.test.ts`
    - _Requirements: 11.4_

  - [x] 16.4 Write E2E tests for shelf category
    - Test create/edit with category, filter, sort
    - Test CSV import/export with shelfCategory column
    - File: `tests/integration/shelf-category.test.ts`
    - _Requirements: 11.5_

  - [x] 16.5 Write E2E tests for prize type rename
    - Verify existing game type functionality works under new prizeType name
    - Test CSV import with legacy `gameType` header
    - File: `tests/integration/prize-type-rename.test.ts`
    - _Requirements: 11.6_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The prizeType rename (tasks 1.1, 5.1, 8.1, 8.2) should be done first to avoid double-renaming later
- Backup/restore (Requirement 7) requires no code changes — `pg_dump`/`pg_restore` automatically includes the new attendees table
- All WebSocket events follow existing broadcast patterns

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5"] },
    { "id": 4, "tasks": ["4.1", "5.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "5.2", "5.3"] },
    { "id": 6, "tasks": ["5.4", "5.5", "5.6", "5.7", "5.8", "7.1"] },
    { "id": 7, "tasks": ["8.1", "8.2", "9.1", "10.1"] },
    { "id": 8, "tasks": ["9.2", "10.2"] },
    { "id": 9, "tasks": ["10.3", "10.4", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3"] },
    { "id": 11, "tasks": ["11.4", "13.1"] },
    { "id": 12, "tasks": ["13.2", "14.1", "14.3"] },
    { "id": 13, "tasks": ["14.2"] },
    { "id": 14, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5"] }
  ]
}
```
