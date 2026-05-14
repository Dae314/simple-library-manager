# Requirements Document

## Introduction

This feature adds three capabilities to the board game library management system: (1) an attendee tracking table with autofill on checkout, (2) a game swap action that atomically exchanges a checked-out game for an available game while preserving attendee information, and (3) a game shelf category classification (Family, Small, Standard) orthogonal to the existing prize type model. As part of this work, the existing `gameType` column is renamed to `prizeType` for clarity, and the new column is named `shelfCategory`.

## Glossary

- **Attendees**: A persistent database table (`attendees`) storing unique attendee records identified by the combination of first name and last name.
- **Autofill_Service**: The component that provides live suggestions from the Attendees table as the user types attendee first and last name during checkout.
- **Swap_Action**: A compound operation that performs a standard checkin followed by a standard checkout to the same attendee in a single atomic database transaction. No new transaction type is introduced; the swap is recorded as a normal checkin transaction and a normal checkout transaction.
- **Shelf_Category**: A classification of a game's physical size and complexity (stored as `shelfCategory`), independent of its prize type. Valid values are `family`, `small`, and `standard`.
- **Prize_Type**: The ownership/prize model of a game (stored as `prizeType`, renamed from the former `gameType`). Valid values are `standard`, `play_and_win`, and `play_and_take`.
- **Library_System**: The overall board game library management application.
- **Transaction_Service**: The service responsible for recording checkout, checkin, and swap transactions.
- **Game_Service**: The service responsible for managing game records including status and metadata.
- **Checkout_Dialog**: The UI dialog presented when checking out a game to an attendee.
- **Swap_Dialog**: The UI dialog presented when initiating a game swap, opened from a checked-out game's Swap button with that game pre-selected as the return game.

## Requirements

### Requirement 1: Attendee Persistence

**User Story:** As a library operator, I want attendee information stored in a dedicated table, so that returning attendees can be identified quickly without re-entering their details.

#### Acceptance Criteria

1. THE Attendees table SHALL store each attendee record with a unique auto-generated ID, a first name (maximum 100 characters), last name (maximum 100 characters), and ID type.
2. THE Attendees table SHALL enforce a unique database constraint on the combination of first name and last name using case-insensitive comparison.
3. THE transactions table SHALL include a foreign key reference (`attendeeId`) to the Attendees table, linking each checkout transaction to the corresponding attendee record.
4. WHEN a checkout is completed with an attendee first name and last name combination that does not exist in the Attendees table (compared case-insensitively after trimming whitespace), THE Transaction_Service SHALL create a new attendee entry with the provided first name, last name, and ID type, and link the transaction to that attendee.
5. WHEN a checkout is completed with an attendee first name and last name combination that already exists in the Attendees table (compared case-insensitively after trimming whitespace), THE Transaction_Service SHALL update the existing attendee entry with the latest ID type, and link the transaction to that attendee.
6. IF a correction transaction is created (isCorrection is true), THEN THE Transaction_Service SHALL NOT create or update any attendee entry.

### Requirement 2: Attendee Autofill on Checkout and Library Filter

**User Story:** As a library operator, I want the checkout form and the library attendee search filter to suggest matching attendees as I type, so that I can complete checkouts and find games faster for returning attendees.

#### Acceptance Criteria

1. WHEN the user types at least 2 characters in the attendee first name or last name field during checkout, THE Autofill_Service SHALL display suggestions matching existing attendee entries within 300 milliseconds of the debounce delay completing, showing a maximum of 10 suggestions.
2. THE Autofill_Service SHALL debounce input keystrokes consistent with other debounced inputs in the project before issuing a query to the Attendees table.
3. WHILE the user is typing in the first name or last name field, THE Autofill_Service SHALL filter suggestions using case-insensitive prefix matching of the typed text against both first name and last name fields in the Attendees table.
4. WHEN the user selects an autofill suggestion, THE Checkout_Dialog SHALL populate the first name, last name, and ID type fields with the values from the selected attendee entry.
5. WHEN no matching attendee entries exist in the Attendees table for the typed text, THE Autofill_Service SHALL display no suggestions and allow the user to proceed with manual entry.
6. IF the Attendees table query fails due to a service error, THEN THE Autofill_Service SHALL suppress the suggestion list without displaying an error and allow the user to continue manual entry.
7. THE Library_System SHALL provide autofill suggestions on the attendee name search filter in the library page, using the same Autofill_Service behavior (debounce, prefix matching, max 10 suggestions) to help operators quickly filter by known attendees.

### Requirement 3: Game Swap Action

**User Story:** As a library operator, I want to swap a checked-out game with an available game in one action, so that attendees can exchange games without separate checkin and checkout steps.

#### Acceptance Criteria

1. THE Library_System SHALL display a "Swap" button on each checked-out game entry in the library page, alongside the existing "Check In" button.
2. WHEN the operator clicks the Swap button on a checked-out game, THE Swap_Dialog SHALL open with that game pre-selected as the return game and present a searchable list of currently available games for the operator to select as the new game.
3. THE Swap_Dialog SHALL allow the operator to filter the available games list by title to quickly find the desired new game.
4. THE Swap_Dialog SHALL display the attendee information (first name, last name, ID type) from the return game's checkout as read-only, non-editable fields.
5. THE Swap_Dialog SHALL only require the operator to input the checkin weight for the return game and the checkout weight for the new game, each as a positive number greater than zero.
6. WHEN a swap is confirmed, THE Transaction_Service SHALL atomically perform a standard checkin of the return game followed by a standard checkout of the new game within a single database transaction, using the same checkout and attendee upsert services as a normal checkout. All changes SHALL be rolled back if any step fails.
7. WHEN a swap is confirmed, THE Transaction_Service SHALL carry over the attendee first name, last name, and ID type from the return game's checkout to the new game's checkout transaction.
8. WHEN a swap is confirmed, THE Transaction_Service SHALL record a standard checkin transaction (type `checkin`) for the return game and a standard checkout transaction (type `checkout`) for the new game, each with the respective weight values. No new transaction type is introduced.
9. WHEN a swap checkout is processed, THE Transaction_Service SHALL upsert the attendee in the Attendees table using the same logic as a normal checkout (Requirement 1).
10. IF the return game is not currently checked out, THEN THE Transaction_Service SHALL reject the swap and display an error message indicating that the return game is not checked out.
11. IF the new game is not currently available, THEN THE Transaction_Service SHALL reject the swap and display an error message indicating that the new game is not available.
12. WHEN a swap is completed, THE Library_System SHALL broadcast WebSocket events for both the checkin and checkout so all connected clients reflect the updated game statuses.
13. WHEN a swap is completed successfully, THE Library_System SHALL display a success toast message indicating the swap was completed.
14. WHEN a swap is completed, THE Transaction_Service SHALL perform weight comparison between the return game's checkout weight and the provided checkin weight using the configured weight tolerance, and display a weight warning to the operator if the difference exceeds the tolerance threshold.

### Requirement 4: Game Shelf Category Classification

**User Story:** As a library operator, I want to classify games by shelf category (Family, Small, Standard), so that I can organize and filter the library by game size independently of the prize type.

#### Acceptance Criteria

1. THE Game_Service SHALL support a `shelfCategory` field on each game record with valid values of `family`, `small`, and `standard`.
2. THE Game_Service SHALL default the `shelfCategory` to `standard` when a new game is created without an explicit shelf category.
3. WHEN the database migration is applied, THE Game_Service SHALL set the `shelfCategory` of all existing games to `standard`.
4. WHEN a game is created or updated with a `shelfCategory` value, THE Game_Service SHALL validate that the value is one of `family`, `small`, or `standard`.
5. IF a game create or update request provides a `shelfCategory` value that is not one of `family`, `small`, or `standard`, THEN THE Game_Service SHALL reject the request and return a validation error indicating the invalid shelf category value.
6. THE Library_System SHALL include a `shelfCategory` selection field on the game creation and game edit forms in the management area, defaulting to `standard` for new games.
7. THE Library_System SHALL display the `shelfCategory` as a column in both the library page table and the management games table, using user-friendly labels ("Family", "Small", "Standard").
7. THE Library_System SHALL allow filtering games by shelf category on the library page and management game list using a filter control that lists all three values with user-friendly labels.
8. THE Library_System SHALL allow sorting by shelf category in both the library page table and the management games table.
9. WHEN games are imported via CSV, THE Game_Service SHALL accept an optional `shelfCategory` column with valid values of `family`, `small`, or `standard`, defaulting to `standard` when the column is omitted or the cell is empty.
10. WHEN games are exported via CSV, THE Game_Service SHALL include the `shelfCategory` column with the current value for each game.
11. IF a CSV row contains a `shelfCategory` value that is not one of `family`, `small`, or `standard`, THEN THE Game_Service SHALL reject the entire import and return a validation error identifying the invalid row.
12. THE Game_Service SHALL store the `shelfCategory` independently from the `prizeType` field, preserving both values without interference.

### Requirement 5: Rename gameType to prizeType

**User Story:** As a library operator, I want the game type field renamed to "prize type" internally, so that the field name clearly communicates its purpose (ownership/prize model) and avoids confusion with the new shelf category.

#### Acceptance Criteria

1. THE Game_Service SHALL rename the database column from `gameType` to `prizeType`, preserving all existing data and valid values (`standard`, `play_and_win`, `play_and_take`).
2. THE Library_System SHALL update all internal references (schema, services, validation, queries) from `gameType` to `prizeType`.
3. THE Library_System SHALL display the prize type on the frontend using user-friendly labels (e.g., "Standard", "Play & Win", "Play & Take") without exposing the internal column name.
4. THE Library_System SHALL maintain all existing filtering, sorting, and badge display functionality for prize type under the new column name.
5. WHEN games are imported or exported via CSV, THE Game_Service SHALL use `prizeType` as the column header, while continuing to accept `gameType` as a legacy alias during import for backward compatibility.

### Requirement 6: Swap Conflict Detection via WebSocket

**User Story:** As a library operator, I want the swap dialog to warn me if either game is modified by another station, so that I don't submit a stale swap.

#### Acceptance Criteria

1. WHILE the Swap_Dialog is open, THE Library_System SHALL listen for WebSocket events affecting either the return game or the selected new game.
2. IF a WebSocket event indicates that the return game or the selected new game has been modified by another client, THEN THE Swap_Dialog SHALL display a warning message and disable the submit button to prevent submission of a stale swap.
3. WHEN the Swap_Dialog detects a conflict via WebSocket, THE Library_System SHALL refresh the underlying game data so the operator sees the current state.
4. WHILE the Swap_Dialog is open, THE Library_System SHALL automatically update the available games list in response to WebSocket events, removing games that are no longer available and adding games that become available.
5. THE Swap_Dialog conflict detection SHALL behave consistently with the existing CheckinDialog and CheckoutDialog conflict detection pattern, except that it monitors two games instead of one.

### Requirement 7: Attendees in Backup and Restore

**User Story:** As a library operator, I want the attendees table included in database backups and restores, so that attendee data is preserved when migrating or recovering the system.

#### Acceptance Criteria

1. WHEN a database backup is exported, THE Library_System SHALL include all records from the Attendees table in the export.
2. WHEN a database backup is restored, THE Library_System SHALL restore all attendee records from the backup into the Attendees table.
3. WHEN a backup is restored, THE Library_System SHALL replace existing attendee records with the backup data, consistent with the existing restore behavior for other tables.

### Requirement 8: Attendee Statistics

**User Story:** As a library operator, I want to see which attendees have checked out the most games, so that I can understand library usage patterns.

#### Acceptance Criteria

1. THE Library_System SHALL display an "Attendees with Most Checkouts" section on the statistics page, showing a ranked list of attendees by total number of checkout transactions.
2. THE statistics section SHALL display each attendee's full name and their total checkout count.
3. THE statistics section SHALL show the top 10 attendees by default, consistent with the existing "Games with Most Checkouts" table format.
4. THE statistics section SHALL only count standard checkout transactions (not corrections) when calculating attendee checkout totals.
5. THE statistics section SHALL respect the same date range and other filters applied to the statistics page, consistent with the behavior of existing statistics views.

### Requirement 9: Attendee Management

**User Story:** As a library operator, I want to view, edit, and delete attendees, so that I can manage who has used the library and correct any data entry mistakes.

#### Acceptance Criteria

1. THE Library_System SHALL provide a management page for attendees, accessible via a navigation link in the management area sidebar/nav alongside existing links (games, transactions, statistics, config, backup).
2. THE management attendees page SHALL list all attendee records from the Attendees table in a sortable table, displaying the attendee first name, last name, ID type, and total transaction count for each record.
3. THE Library_System SHALL support searching the attendee list by first name or last name using case-insensitive partial matching against the search input (maximum 100 characters).
4. THE Library_System SHALL provide an ID type filter on the attendee management page that filters attendees by their ID type using a select dropdown listing all ID types configured in the system.
5. THE Library_System SHALL display the attendee list with pagination using a default page size of 10 records, with selectable page sizes of 10, 25, or 50.
6. THE Library_System SHALL allow sorting the attendee list by first name, last name, ID type, or transaction count columns.
7. THE Library_System SHALL display the attendee list sorted by last name in ascending order by default.
8. WHEN the operator clicks on an attendee row, THE Library_System SHALL navigate to an edit page where the operator can modify the attendee's first name, last name, and ID type.
9. IF an attendee edit would result in a first name and last name combination that already exists for another attendee (case-insensitive), THEN THE Library_System SHALL reject the edit and display a validation error indicating the name combination is already in use.
10. THE Library_System SHALL provide a delete action for each attendee, with a confirmation dialog that displays the number of transactions that will be cascade-deleted.
11. IF the attendee has any active checkouts (games currently checked out to them), THEN THE Library_System SHALL prevent deletion and display an error message indicating the attendee has active checkouts that must be checked in first.
12. WHEN an attendee is deleted, THE Library_System SHALL cascade-delete all transactions associated with that attendee via the foreign key relationship.
13. WHEN an attendee is created, updated, or deleted, THE Library_System SHALL broadcast a WebSocket event so all connected clients reflect the change.
15. THE management attendees page SHALL be classified as a live-update page, automatically refreshing its data in response to attendee WebSocket events (`attendee_created`, `attendee_updated`, `attendee_deleted`) without requiring a manual page reload.
14. IF a search query matches no attendee records, THEN THE Library_System SHALL display an empty state message indicating no attendees were found.

### Requirement 10: Transaction Log Attendee Filtering

**User Story:** As a library operator, I want to filter the transaction log by attendee name, so that I can quickly find all transactions for a specific person.

#### Acceptance Criteria

1. THE Library_System SHALL provide an attendee name filter on the management transactions page that filters transactions by matching against attendee first name or last name using case-insensitive partial matching.
2. THE attendee name filter on the transactions page SHALL provide autofill suggestions from the Attendees table, using the same Autofill_Service behavior as the checkout dialog and library page (debounce, prefix matching, max 10 suggestions).
3. WHEN an attendee name filter is applied, THE Library_System SHALL display only transactions where the attendee first name or last name matches the filter text.
4. THE attendee name filter SHALL work in combination with existing transaction filters (game title, transaction type, date range) without interference.

### Requirement 11: Property-Based and E2E Test Coverage

**User Story:** As a developer, I want comprehensive property-based tests and end-to-end tests for all new features, so that correctness properties are verified and user flows are validated.

#### Acceptance Criteria

1. THE Library_System SHALL include property-based tests (fast-check) validating all correctness properties defined in the design document, covering attendee validation, swap validation, shelf category validation, CSV round-trips, conflict detection, attendee search, and attendee statistics.
2. THE Library_System SHALL include E2E integration tests (Playwright) covering the full swap flow including weight warnings and conflict detection.
3. THE Library_System SHALL include E2E integration tests covering attendee autofill behavior on the checkout dialog, library page filter, and transactions page filter.
4. THE Library_System SHALL include E2E integration tests covering attendee management CRUD operations, search, deletion with cascade, and active checkout prevention.
5. THE Library_System SHALL include E2E integration tests covering shelf category creation, editing, filtering, sorting, and CSV import/export.
6. THE Library_System SHALL include E2E integration tests verifying that existing game type functionality works correctly under the renamed prize type column.
7. THE Library_System SHALL update existing property-based tests that reference `gameType` to use `prizeType`, ensuring no test regressions from the rename.
