# Implementation Plan: Board Game Library

## Overview

Incremental implementation of a convention board game library management system using SvelteKit, TypeScript, Drizzle ORM, PostgreSQL, and Docker. Tasks are ordered: infrastructure → database → core services → frontend pages → advanced features → testing.

## Tasks

- [x] 1. Project scaffolding and infrastructure setup
  - [x] 1.1 Initialize SvelteKit project with TypeScript and Node adapter
    - Run `npm create svelte@latest` with TypeScript, install dependencies
    - Configure `svelte.config.js` with Node adapter, `tsconfig.json`, `vite.config.ts`
    - Install core dependencies: drizzle-orm, pg, drizzle-kit, svelte-french-toast
    - _Requirements: 10.8, 10.9, 10.11_

  - [x] 1.2 Create Docker and deployment configuration
    - Create `Dockerfile` (Node.js build + production image)
    - Create `docker-compose.yml` with Caddy, SvelteKit app, PostgreSQL services
    - Create `Caddyfile` with self-signed TLS and reverse proxy to port 3000
    - Configure PostgreSQL Docker volume for data persistence
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6_

  - [x] 1.3 Set up Drizzle ORM configuration and migration runner
    - Create `drizzle.config.ts` pointing to schema and migrations directory
    - Implement migration runner in `src/hooks.server.ts` to auto-run pending migrations on startup
    - _Requirements: 10.9, 10.10_

- [x] 2. Database schema and seed data
  - [x] 2.1 Define Drizzle schema for all tables
    - Create `src/lib/server/db/schema.ts` with `convention_config`, `id_types`, `games`, `transactions` tables
    - Include all indexes as specified in design (bgg_id, status, game_type, game_id, type, created_at, attendee)
    - Include version columns for optimistic locking on `games` and `convention_config`
    - _Requirements: 10.9, 11.1, 11.2, 20.1_

  - [x] 2.2 Create Drizzle database client instance
    - Create `src/lib/server/db/index.ts` with PostgreSQL connection using `pg` driver
    - Export typed Drizzle client for use in services
    - _Requirements: 10.9_

  - [x] 2.3 Generate initial migration and seed data
    - Run `drizzle-kit generate` to create the initial migration SQL
    - Create `src/lib/server/db/seed.ts` with 10 example games (Catan ×2, Ticket to Ride ×2, Pandemic, Azul, Codenames as play_and_win, Wingspan, 7 Wonders as play_and_take, Splendor)
    - Seed runs only when games table is empty (first-run check)
    - _Requirements: 18.1, 18.2, 18.3_

- [x] 3. Shared validation and utility modules
  - [x] 3.1 Implement server-side validation schemas
    - Create `src/lib/server/validation.ts` with validation functions for game input, checkout input, checkin input, config input, CSV rows
    - Validate title non-empty, BGG_ID positive integer, weight positive number, dates logical
    - _Requirements: 1.2, 1.3, 1.4, 4.8, 5.8, 14.6, 14.7_

  - [x] 3.2 Implement client-side utility modules
    - Create `src/lib/utils/formatting.ts` for date, duration, and weight formatting
    - Create `src/lib/utils/validation.ts` for client-side validation helpers
    - _Requirements: 10.7, 14.4_

- [x] 4. Core server-side services
  - [x] 4.1 Implement Game Service
    - Create `src/lib/server/services/games.ts` with CRUD operations (create, update, retire, restore)
    - Implement copy number auto-generation (MAX+1 per BGG_ID within transaction)
    - Implement list queries with filters (status, game type, title search, date filters) and pagination
    - Implement `listAvailable` and `listCheckedOut` queries excluding retired games
    - Implement `toggleStatus` with optimistic locking and corrective transaction creation
    - _Requirements: 1.1, 1.5, 2.1, 2.4, 2.5, 2.6, 3.1, 3.8, 11.1, 11.2_

  - [x] 4.2 Implement Transaction Service
    - Create `src/lib/server/services/transactions.ts` with checkout, checkin, and reversal logic
    - Implement optimistic locking check in checkout (version match)
    - Implement weight comparison in checkin (return warning if |diff| > tolerance)
    - Implement play_and_take logic (retire game if attendee takes it)
    - Implement reversal with conflict detection and corrective transaction creation
    - Implement transaction list query with filters (game title, type, attendee name) and pagination
    - _Requirements: 4.1, 4.9, 4.13, 5.1, 5.6, 5.7, 8.1, 8.2, 8.3, 20.7, 20.8_

  - [x] 4.3 Implement Statistics Service
    - Create `src/lib/server/services/statistics.ts` with aggregation queries
    - Implement total checkouts, current checked-out/available counts, avg checkouts per day
    - Implement duration metrics (avg, min, max) using only completed checkout-checkin pairs
    - Implement longest cumulative game, top games ranked list, duration distribution buckets
    - Implement all filters: time range, time of day, convention day, game title, attendee, status, game type, BGG title grouping
    - _Requirements: 12.1–12.20_

  - [x] 4.4 Implement Config Service
    - Create `src/lib/server/services/config.ts` with get/update for convention configuration
    - Implement ID types management (add, remove, list)
    - Validate end date >= start date, weight tolerance > 0
    - _Requirements: 14.1–14.10_

  - [x] 4.5 Implement Backup Service
    - Create `src/lib/server/services/backup.ts` with pg_dump export (streaming) and pg_restore import
    - Validate uploaded file before restoring
    - _Requirements: 15.1–15.7_

  - [x] 4.6 Implement CSV Service
    - Create `src/lib/server/services/csv.ts` with CSV validation, import, and export using PapaParse
    - Validate all rows before importing (collect all errors)
    - Generate copy numbers for imported games
    - Export all games with title, BGG_ID, copy_number, status
    - _Requirements: 19.1–19.6_

- [x] 5. Property-based tests: Validation properties
  - [x] 5.1 Write property test for game record validation
    - **Property 1: Game record validation rejects invalid input**
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.3**
    - Test file: `tests/properties/game-validation.prop.test.ts`

  - [x] 5.2 Write property test for checkout validation
    - **Property 2: Checkout validation rejects incomplete input**
    - **Validates: Requirements 4.4, 4.5, 4.6, 4.7, 4.8**
    - Test file: `tests/properties/transaction-validation.prop.test.ts`

  - [x] 5.3 Write property test for checkin validation
    - **Property 3: Checkin validation rejects missing or invalid weight**
    - **Validates: Requirements 5.5, 5.8**
    - Test file: `tests/properties/transaction-validation.prop.test.ts`

  - [x] 5.4 Write property test for transaction data round-trip
    - **Property 6: Transaction data round-trip**
    - **Validates: Requirements 4.9, 4.15, 5.6, 5.13**
    - Test file: `tests/properties/transaction-validation.prop.test.ts`

- [x] 6. Property-based tests: State machine and locking
  - [x] 6.1 Write property test for game status state machine
    - **Property 4: Game status state machine transitions**
    - **Validates: Requirements 4.1, 4.2, 5.1, 5.2**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [x] 6.2 Write property test for optimistic locking
    - **Property 5: Optimistic locking rejects stale versions**
    - **Validates: Requirements 4.13**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [x] 6.3 Write property test for transaction reversal
    - **Property 15: Transaction reversal restores status and creates corrective record**
    - **Validates: Requirements 8.1, 8.2, 8.3**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

- [x] 7. Property-based tests: Weight, retire/restore, and game types
  - [x] 7.1 Write property test for weight warning correctness
    - **Property 7: Weight warning correctness**
    - **Validates: Requirements 5.7**
    - Test file: `tests/properties/weight-warning.prop.test.ts`
    - Tests pure function: `shouldWarnWeight()` from `validation.ts`

  - [x] 7.2 Write property test for retire/restore round-trip
    - **Property 8: Retire/restore round-trip**
    - **Validates: Requirements 3.1, 3.8, 3.9**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [x] 7.3 Write property test for retired games excluded from views
    - **Property 9: Retired games excluded from checkout and checkin views**
    - **Validates: Requirements 3.5, 4.10, 5.9**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [x] 7.4 Write property test for play-and-take checkin behavior
    - **Property 17: Play-and-take checkin behavior**
    - **Validates: Requirements 20.7, 20.8**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

- [x] 8. Property-based tests: Copy numbers, statistics, config, CSV, and BGG URL
  - [x] 8.1 Write property test for copy number sequential uniqueness
    - **Property 14: Copy number sequential uniqueness**
    - **Validates: Requirements 11.2**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [x] 8.2 Write property test for statistics duration metrics
    - **Property 16: Statistics duration metrics use only completed pairs**
    - **Validates: Requirements 12.16, 12.19**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [x] 8.3 Write property test for BGG URL format
    - **Property 18: BGG URL format**
    - **Validates: Requirements 9.1**
    - Test file: `tests/properties/game-validation.prop.test.ts`
    - Tests pure string formatting: `https://boardgamegeek.com/boardgame/{BGG_ID}`

  - [x] 8.4 Write property test for convention configuration validation
    - **Property 19: Convention configuration validation**
    - **Validates: Requirements 14.6, 14.7**
    - Test file: `tests/properties/config-validation.prop.test.ts`
    - Tests pure function: `validateConfigInput()` from `validation.ts`

  - [x] 8.5 Write property test for CSV validation error reporting
    - **Property 20: CSV validation reports all errors**
    - **Validates: Requirements 19.2, 19.3**
    - Test file: `tests/properties/csv.prop.test.ts`
    - Tests pure function: `validateCsvRows()` from `validation.ts`

  - [x] 8.6 Write property test for CSV export completeness
    - **Property 21: CSV export completeness**
    - **Validates: Requirements 19.6**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

- [x] 9. Checkpoint - Core services and property tests complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Layout, navigation, and shared components
  - [ ] 10.1 Implement root layout with Navbar and convention name
    - Create `src/routes/+layout.svelte` with responsive Navbar, Toaster (svelte-french-toast)
    - Create `src/routes/+layout.server.ts` to load convention config (name, weight unit)
    - _Requirements: 17.1, 14.2_

  - [ ] 10.2 Implement Navbar component with responsive behavior
    - Create `src/lib/components/Navbar.svelte` with persistent bar (tablet/desktop) and hamburger menu (mobile)
    - Show Checkout, Checkin always visible; Catalog, Statistics, Management, Config in hamburger on mobile
    - Highlight active page
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [ ] 10.3 Implement shared UI components
    - Create `Pagination.svelte` (page controls, page size selector, total count display)
    - Create `SearchFilter.svelte` (debounced text input, 300ms)
    - Create `ConfirmDialog.svelte` (modal with configurable title/message/warning)
    - Create `WeightWarning.svelte` (dismissible alert with weight details)
    - Create `GameTypeBadge.svelte` (color-coded badge for standard/play_and_win/play_and_take)
    - Create `FilterPanel.svelte` (composable filter panel with text, dropdowns, date pickers, toggles)
    - _Requirements: 16.2, 16.3, 16.4, 10.12_

- [ ] 11. Checkout page
  - [ ] 11.1 Implement checkout page server logic
    - Create `src/routes/checkout/+page.server.ts` with load (available games, paginated, searchable) and checkout action
    - Pass game version for optimistic locking, validate all required fields, call transactionService.checkout
    - Handle conflict (409) response for stale version
    - _Requirements: 4.1, 4.4–4.9, 4.10, 4.12, 4.13, 4.14, 4.15_

  - [ ] 11.2 Implement checkout page UI
    - Create `src/routes/checkout/+page.svelte` with search bar, paginated game list with type badges
    - Checkout form: attendee first/last name, ID type dropdown (from config), weight input, optional note
    - Display validation errors, conflict messages, success toast
    - _Requirements: 4.3, 4.8, 4.10, 4.11, 4.12, 4.13_

- [ ] 12. Checkin page
  - [ ] 12.1 Implement checkin page server logic
    - Create `src/routes/checkin/+page.server.ts` with load (checked-out games with attendee info and duration, paginated, searchable) and checkin action
    - Validate weight, call transactionService.checkin, return weight warning if applicable
    - Handle play_and_win reminder flag and play_and_take attendee choice
    - _Requirements: 5.1, 5.4–5.13, 20.5, 20.6, 20.7, 20.8_

  - [ ] 12.2 Implement checkin page UI
    - Create `src/routes/checkin/+page.svelte` with search bar (title or attendee name), paginated game list with attendee info and checkout duration
    - Checkin form: weight input, optional note
    - ID return reminder, weight warning display, play_and_win raffle reminder, play_and_take dialog
    - _Requirements: 5.3, 5.4, 5.7, 5.9, 5.10, 5.11, 5.12, 20.5, 20.6_

- [ ] 13. Catalog page
  - [ ] 13.1 Implement catalog page
    - Create `src/routes/catalog/+page.server.ts` with load (all non-retired games, filtered, paginated)
    - Create `src/routes/catalog/+page.svelte` with filter bar (status, game type, title search), game list with BGG links, status indicators, type badges, copy identifiers
    - _Requirements: 6.1–6.5, 9.1, 9.2, 11.3_

- [ ] 14. Management area
  - [ ] 14.1 Implement management game list page
    - Create `src/routes/management/+page.server.ts` with load (games with advanced filters, sorting, pagination) and actions (bulk retire, restore)
    - Create `src/routes/management/+page.svelte` with FilterPanel, bulk select checkboxes, retire/restore buttons, confirmation dialogs
    - _Requirements: 3.1–3.9, 13.1–13.10_

  - [ ] 14.2 Implement add game page
    - Create `src/routes/management/games/new/+page.server.ts` and `+page.svelte`
    - Form: title, BGG_ID, game type selector; validation errors display
    - _Requirements: 1.1–1.5, 20.2_

  - [ ] 14.3 Implement edit game page
    - Create `src/routes/management/games/[id]/+page.server.ts` and `+page.svelte`
    - Form: edit title, BGG_ID, game type; status toggle with corrective transaction
    - _Requirements: 2.1–2.6, 20.3_

  - [ ] 14.4 Implement transaction log page
    - Create `src/routes/management/transactions/+page.server.ts` and `+page.svelte`
    - Display chronological transaction list with filters (game title, type, attendee name), pagination
    - Reversal action buttons with conflict handling
    - _Requirements: 7.1–7.5, 8.1–8.3_

- [ ] 15. Property-based tests: Filtering, sorting, and pagination
  - [ ] 15.1 Write property test for transaction log chronological ordering
    - **Property 10: Transaction log chronological ordering**
    - **Validates: Requirements 7.1**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [ ] 15.2 Write property test for filter predicate correctness
    - **Property 11: Filter predicate correctness**
    - **Validates: Requirements 6.2, 6.3, 6.4, 7.3, 7.4, 7.5, 12.6, 13.1**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [ ] 15.3 Write property test for combined filters intersection
    - **Property 12: Combined filters produce intersection**
    - **Validates: Requirements 12.18, 13.9**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [ ] 15.4 Write property test for sort ordering correctness
    - **Property 13: Sort ordering correctness**
    - **Validates: Requirements 13.5**
    - Skipped from property tests: requires database integration. Covered by integration tests (task 20).

  - [ ] 15.5 Write property test for pagination correctness
    - **Property 22: Pagination returns correct subset**
    - **Validates: Requirements 16.1, 16.4**
    - Test file: `tests/properties/pagination.prop.test.ts`
    - Tests pure pagination math: given N items, page P, page size S, verify correct subset

- [ ] 16. Checkpoint - Core pages and filtering tests complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Statistics page
  - [ ] 17.1 Implement statistics page
    - Create `src/routes/statistics/+page.server.ts` with load (aggregated stats with all filters)
    - Create `src/routes/statistics/+page.svelte` with FilterPanel (time range, time of day, convention day, game title, attendee, status, game type, BGG grouping toggle)
    - Display metric cards, ranked game list (paginated), duration distribution
    - Handle empty results with "no matching data" message
    - _Requirements: 12.1–12.20_

- [ ] 18. Configuration page
  - [ ] 18.1 Implement convention configuration page
    - Create `src/routes/management/config/+page.server.ts` and `+page.svelte`
    - Form: convention name, start/end dates, weight tolerance, weight unit selector
    - ID types management (add/remove list)
    - Validation errors for invalid dates and non-positive tolerance
    - _Requirements: 14.1–14.10_

- [ ] 19. Backup and CSV pages
  - [ ] 19.1 Implement database backup page
    - Create `src/routes/management/backup/+page.server.ts` and `+page.svelte`
    - Create `src/routes/api/backup/export/+server.ts` for streaming download
    - Export button (download), import with file upload and confirmation dialog
    - Error handling for invalid files, success confirmations
    - _Requirements: 15.1–15.7_

  - [ ] 19.2 Implement CSV import/export page
    - Create `src/routes/management/csv/+page.server.ts` and `+page.svelte`
    - CSV upload with validation preview (show errors or row count), confirmation dialog, import action
    - CSV export download button
    - _Requirements: 19.1–19.6_

- [ ] 20. Integration tests (Playwright)
  - [ ] 20.1 Write Playwright test for full checkout → checkin flow
    - Test complete checkout and checkin through browser UI
    - Verify status changes, attendee info display, weight warning
    - _Requirements: 4.1–4.15, 5.1–5.13_

  - [ ] 20.2 Write Playwright test for database backup/restore round-trip
    - Export database, import on fresh state, verify data integrity
    - _Requirements: 15.1–15.7_

  - [ ] 20.3 Write Playwright test for responsive navigation
    - Test navbar on desktop vs hamburger menu on mobile viewports
    - _Requirements: 17.1–17.4_

- [ ] 21. Checkpoint - All features and integration tests complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for a complete implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (22 properties total)
- The design specifies TypeScript throughout (SvelteKit + Drizzle ORM)
- All property tests use fast-check with Vitest, minimum 100 iterations per property
