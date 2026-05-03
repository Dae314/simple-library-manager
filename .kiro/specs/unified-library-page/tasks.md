# Implementation Plan: Unified Library Page

## Overview

This plan consolidates the existing `/checkout`, `/checkin`, and `/catalog` pages into a single `/library` page with contextual action buttons, popover dialogs for checkout/check-in forms, simplified navigation, an updated landing page with hero image, and removal of legacy routes. Implementation proceeds bottom-up: service layer → page server → UI components → navigation/landing → WebSocket integration → legacy cleanup.

## Tasks

- [x] 1. Implement the `listLibrary()` service method
  - [x] 1.1 Add `listLibrary()` to `src/lib/server/services/games.ts`
    - Add `LibraryGameRecord` interface extending `GameRecord` with `attendeeFirstName`, `attendeeLastName`, `idType`, `checkoutWeight`, `checkoutAt` fields
    - Implement the unified query using LEFT JOIN on latest checkout transaction (ROW_NUMBER window subquery), matching the SQL strategy in the design
    - Support filters: `status` (available/checked_out), `gameType`, `titleSearch` (ILIKE on game title), `attendeeSearch` (ILIKE on attendee first/last name)
    - Support sort fields: `title`, `game_type`, `status`, `bgg_id`
    - Support pagination with `page` and `pageSize` parameters
    - Exclude retired games by default
    - Available games should have null attendee/checkout fields
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Write property test: Unified listing returns all non-retired games with correct checkout fields
    - **Property 1: Unified listing returns all non-retired games with correct checkout fields**
    - **Validates: Requirements 1.1, 1.3, 2.4**
    - File: `tests/properties/library.prop.test.ts`
    - Generate random game sets with mixed statuses (available, checked_out, retired), insert into test DB, call `listLibrary()`, verify only non-retired games returned with correct attendee/checkout fields

  - [x] 1.3 Write property test: Sort correctness
    - **Property 2: Sort correctness**
    - **Validates: Requirements 1.4**
    - File: `tests/properties/library.prop.test.ts`
    - Generate non-retired games, call `listLibrary()` with each valid sort field and direction, verify results are ordered correctly

  - [x] 1.4 Write property test: Pagination correctness
    - **Property 3: Pagination correctness**
    - **Validates: Requirements 1.5**
    - File: `tests/properties/library.prop.test.ts`
    - Generate non-retired games, call `listLibrary()` with various page/pageSize values, verify correct subset size, total count, and page offset

  - [x] 1.5 Write property test: Title search filter correctness
    - **Property 4: Title search filter correctness**
    - **Validates: Requirements 1.6**
    - File: `tests/properties/library.prop.test.ts`
    - Generate games with random titles, search with substring, verify all returned games match and all matching games are returned

  - [x] 1.6 Write property test: Attendee name search filter correctness
    - **Property 5: Attendee name search filter correctness**
    - **Validates: Requirements 1.7**
    - File: `tests/properties/library.prop.test.ts`
    - Generate checked-out games with attendee names, search by attendee name substring, verify only matching games returned

  - [x] 1.7 Write property test: Status filter correctness
    - **Property 6: Status filter correctness**
    - **Validates: Requirements 2.2, 2.3**
    - File: `tests/properties/library.prop.test.ts`
    - Generate mixed-status non-retired games, filter by status, verify all returned games match the filter and all matching games are included

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create the library page server and route
  - [x] 3.1 Create `src/routes/library/+page.server.ts` with load function
    - Parse URL query parameters: `search`, `attendeeSearch`, `status`, `gameType`, `page`, `pageSize`, `sortField`, `sortDir`
    - Call `gameService.listLibrary()` with parsed filters, pagination, and sort
    - Call `configService.getIdTypes()` for checkout form ID type options
    - Call `configService.get()` for `weightUnit` and `weightTolerance`
    - Call `gameService.getLastWeights()` for weight prefill on available games
    - Return `LibraryPageData` shape matching the design interface
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.6, 10.1, 10.2_

  - [x] 3.2 Add `checkout` form action to `src/routes/library/+page.server.ts`
    - Validate input with `validateCheckoutInput` from `$lib/server/validation.js`
    - Call `transactionService.checkout()` with validated data
    - Broadcast game and transaction events via `broadcastGameEvent` and `broadcastTransactionEvent`
    - Return `fail(400, { errors, values })` for validation errors
    - Return `fail(409, { conflict: true, message })` for optimistic locking conflicts
    - Return `{ success: true }` on success
    - _Requirements: 4.5, 4.6, 4.7_

  - [x] 3.3 Add `checkin` form action to `src/routes/library/+page.server.ts`
    - Validate input with `validateCheckinInput` from `$lib/server/validation.js`
    - Call `transactionService.checkin()` with validated data (including `attendeeTakesGame` flag)
    - Broadcast game and transaction events
    - Return `fail(400, { errors, values, gameId })` for validation errors
    - Return `fail(409, { conflict: true, message })` for conflict (game no longer checked out)
    - Return `{ success: true }` on success, with optional `weightWarning` data
    - _Requirements: 5.5, 5.6, 5.7, 7.3, 7.4, 7.5_

- [x] 4. Create the CheckoutDialog component
  - [x] 4.1 Create `src/lib/components/CheckoutDialog.svelte`
    - Implement as a `<dialog>` element using `showModal()` pattern from existing `ConfirmDialog.svelte`
    - Accept props: `open`, `game`, `gameDisplayTitle`, `idTypes`, `weightUnit`, `prefillWeight`, `statusChangeWarning`, `formErrors`, `formValues`, `onClose`, `onSubmit`
    - Display game title in dialog header
    - Form fields: attendee first name, attendee last name, ID type (select), checkout weight (prefilled with last weight), note (optional)
    - Hidden fields: `gameId`, `gameVersion`
    - Cancel button and Escape key close via `onClose`
    - Backdrop click closes via `onClose`
    - When `statusChangeWarning` is true, show warning banner and disable submit button
    - Display field-level validation errors from `formErrors`
    - Preserve entered values from `formValues` on validation failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 8.1, 8.2, 8.3, 8.4, 8.6, 9.4, 9.5, 9.6_

- [x] 5. Create the CheckinDialog component
  - [x] 5.1 Create `src/lib/components/CheckinDialog.svelte`
    - Implement as a `<dialog>` element using `showModal()` pattern
    - Accept props: `open`, `game`, `gameDisplayTitle`, `weightUnit`, `weightTolerance`, `statusChangeWarning`, `formErrors`, `formValues`, `onClose`, `onSubmit`
    - Display game title in dialog header
    - Show ID return reminder with attendee name and ID type
    - Show raffle reminder for `play_and_win` games
    - Display checkout weight as reference above weight input
    - Implement live weight warning using `getWeightWarningLevel` logic client-side (red/yellow/none levels)
    - Form fields: check-in weight, note (optional)
    - Hidden field: `gameId`
    - For `play_and_take` games, intercept submission to show `ConfirmDialog` asking if attendee takes the game; set hidden `attendeeTakesGame` field accordingly
    - When `statusChangeWarning` is true, show warning banner and disable submit button
    - Cancel/Escape/backdrop click close via `onClose`
    - Display field-level validation errors from `formErrors`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.6, 9.4, 9.5, 9.6_

  - [x] 5.2 Write property test: Weight warning level classification
    - **Property 7: Weight warning level classification**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
    - File: `tests/properties/weight-warning.prop.test.ts`
    - Generate random positive checkout weights, check-in weights, and tolerances; verify `getWeightWarningLevel()` returns correct level (red when difference > tolerance, yellow when between 2% and tolerance, none when within 2%)

- [x] 6. Create the unified library page component
  - [x] 6.1 Create `src/routes/library/+page.svelte`
    - Render `SortableTable` with columns: Title, Type, Status, BGG, Attendee, Duration, Weight, Actions
    - Available game rows show "—" placeholders for attendee, duration, and weight columns
    - Checked-out game rows show attendee name, checkout duration (using `formatDuration`), and checkout weight (using `formatWeight`)
    - Action column: "Checkout" button for available games, "Check In" button for checked-out games
    - Filter bar: Game Title Search (text), Attendee Name Search (text), Status Filter (select with All/Available/Checked Out), Game Type Filter (select with Standard/Play & Win/Play & Take)
    - Manage state: `selectedGame`, `dialogMode` ('checkout' | 'checkin' | null), `statusChangeWarning`
    - Clicking action button sets `selectedGame` and `dialogMode`, opening the corresponding dialog
    - Store ref to trigger button for focus return on dialog close
    - Use `$effect` to sync `selectedGame` with refreshed data by matching game ID
    - Wire `CheckoutDialog` and `CheckinDialog` with form submission via `use:enhance` and SvelteKit form actions (`?/checkout`, `?/checkin`)
    - Handle success (toast + close dialog), conflict (toast error + close dialog), and validation errors (pass to dialog)
    - URL-driven state: all filters, sort, search, pagination stored as query parameters; update URL on filter/sort change without full page reload; reset pagination to page 1 on filter change
    - Display `ConnectionIndicator` for WebSocket status
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 4.1, 4.5, 4.6, 5.1, 5.5, 5.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 9.3, 10.1, 10.2, 10.3_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update WebSocket integration for the library page
  - [x] 8.1 Update `src/lib/stores/websocket.svelte.ts` for `/library` route
    - Add `/library` to `LIVE_UPDATE_PAGES` array
    - Remove `/checkout`, `/checkin`, `/catalog` from `LIVE_UPDATE_PAGES`
    - Modify the `onmessage` handler so that on `'invalidate'` action, it also calls `onConflict` callback if the event has a `gameId` field — this enables both table refresh and dialog conflict detection simultaneously
    - _Requirements: 9.1, 9.2_

  - [x] 8.2 Wire WebSocket conflict detection in `src/routes/library/+page.svelte`
    - Set `wsClient.setOnConflict()` with a handler that checks if the event's `gameId` matches `selectedGame?.id`
    - If match, set `statusChangeWarning = true` and call `invalidateAll()` to refresh table data
    - The dialog components already handle `statusChangeWarning` prop (disable submit, show warning)
    - _Requirements: 9.4, 9.5, 9.6_

  - [x] 8.3 Write property test: WebSocket event handling for /library page
    - **Property 8: WebSocket event handling for /library page**
    - **Validates: Requirements 9.2**
    - File: `tests/properties/library-websocket.prop.test.ts`
    - Generate random game event types with any gameId, call `handleEvent()` with pathname `/library`, verify it returns `'invalidate'`

  - [x] 8.4 Write property test: Conflict detection matches open dialog game
    - **Property 9: Conflict detection matches open dialog game**
    - **Validates: Requirements 9.4**
    - File: `tests/properties/library-websocket.prop.test.ts`
    - Generate random event gameIds and dialog gameIds, verify conflict detection logic flags warning if and only if gameIds match

- [x] 9. Update the Navbar component
  - [x] 9.1 Simplify `src/lib/components/Navbar.svelte`
    - Remove `primaryLinks` and `secondaryLinks` arrays
    - Replace with three navigation items: convention name → `/` (existing brand link), "Library" → `/library`, gear/cog icon + "Manage" text → `/management`
    - Implement gear icon as inline SVG cog icon with "Manage" text label next to it
    - Update `isActive()` to handle `/library` route
    - Simplify mobile hamburger menu to show "Library" and "Manage" links only
    - Remove Statistics and Config direct links from navbar (accessible via Management landing page)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 10. Update the Landing Page
  - [x] 10.1 Add placeholder hero image to `static/hero.jpg`
    - Create a simple gradient or placeholder image file at `static/hero.jpg` with approximately 3:1 or 4:1 wide banner aspect ratio
    - _Requirements: 13.4, 13.5, 13.6_

  - [x] 10.2 Redesign `src/routes/+page.svelte`
    - Display convention name as a prominent `<h1>` heading using `data.conventionName` from layout data
    - Display hero image banner using `<img src="/hero.jpg">` with appropriate alt text and aspect ratio styling
    - Display a prominent "Browse the Library" CTA button/link navigating to `/library`
    - Add HTML comment documenting the hero image file path (`static/hero.jpg`) for convention runners to replace
    - Style the page with centered layout, hero image as wide banner, and prominent CTA
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 13.8_

- [x] 11. Remove legacy route files
  - [x] 11.1 Delete legacy route directories
    - Remove `src/routes/checkout/` directory and all files (`+page.svelte`, `+page.server.ts`)
    - Remove `src/routes/checkin/` directory and all files (`+page.svelte`, `+page.server.ts`)
    - Remove `src/routes/catalog/` directory and all files (`+page.svelte`, `+page.server.ts`)
    - After removal, navigating to `/checkout`, `/checkin`, or `/catalog` should return SvelteKit's default 404
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 12. Update integration tests for the unified library page
  - [x] 12.1 Update `tests/integration/checkout-checkin.test.ts` for `/library` route
    - Rewrite checkout and check-in flows to use the `/library` page with popover dialogs instead of separate `/checkout` and `/checkin` pages
    - Update element selectors for the new dialog-based UI (action buttons in table rows, dialog form fields)
    - Update `fixtures.ts` helpers (`checkoutGame`, `checkinGame`) if the UI interaction flow changed
    - _Requirements: 4.1, 4.5, 5.1, 5.5_

  - [x] 12.2 Update `tests/integration/catalog.test.ts` for `/library` route
    - Rewrite catalog browsing tests to use `/library` instead of `/catalog`
    - Update filter and search tests for the unified filter bar (status filter, game type filter, title search, attendee search)
    - Add tests for attendee name search filtering
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3_

  - [x] 12.3 Update realtime integration tests for `/library` route
    - Update `realtime-checkout.test.ts`, `realtime-checkin.test.ts`, `realtime-conflict.test.ts`, `realtime-form-preservation.test.ts`, `realtime-indicator.test.ts`, and `realtime-static.test.ts` to use `/library` instead of `/checkout`, `/checkin`, `/catalog`
    - Update conflict tests to verify Status_Change_Warning behavior in popover dialogs
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6_

  - [x] 12.4 Update `tests/integration/responsive-nav.test.ts` for simplified navbar
    - Update navigation link assertions for the new three-item navbar (convention name, Library, Manage icon)
    - Remove assertions for old links (Checkout, Check In, Catalog, Statistics, Config)
    - Add assertions for gear/cog icon with "Manage" text
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 12.5 Add integration tests for landing page and legacy route 404s
    - Test landing page displays convention name heading, hero image, and "Browse the Library" CTA
    - Test CTA navigates to `/library`
    - Test `/checkout`, `/checkin`, `/catalog` return 404
    - _Requirements: 12.4, 13.1, 13.2, 13.3, 13.4_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 9 correctness properties defined in the design document
- The design uses TypeScript throughout — all code examples and implementations use TypeScript with Svelte 5 runes API
- Existing components (`SortableTable`, `ConfirmDialog`, `ConnectionIndicator`, `GameTypeBadge`) and utilities (`formatDuration`, `formatWeight`) are reused
- The `CheckoutDialog` and `CheckinDialog` follow the `<dialog>` + `showModal()` pattern established by `ConfirmDialog.svelte`
