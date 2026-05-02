# Requirements Document

## Introduction

This feature adds the ability to permanently delete a game from the board game library. Deletion is only accessible from the game detail page (`/management/games/[id]`), ensuring games are deleted one at a time with full context. Before deletion, the user is shown a confirmation dialog that warns about cascading transaction deletion and displays the count of affected transactions. If a management password is set, the user must re-enter it before the deletion proceeds. Once confirmed, the game record and all associated transactions are permanently removed from the database.

## Glossary

- **Game_Detail_Page**: The SvelteKit page at `/management/games/[id]` that displays and allows editing of a single game record
- **Deletion_Confirmation_Dialog**: A modal dialog that warns the user about the consequences of deleting a game, displays the count of transactions that will be deleted, and collects confirmation before proceeding
- **Transaction_Count**: The number of rows in the `transactions` table where `gameId` matches the game being deleted
- **Game_Deletion_Service**: The server-side logic responsible for permanently removing a game and all its associated transactions from the database within a single atomic operation
- **Password_Hash**: The bcrypt hash of the management password stored in the `convention_config` table; null means no password is set

## Requirements

### Requirement 1: Delete Button Placement

**User Story:** As a convention organizer, I want to see a delete option only on the game detail page, so that I always have full context about which game I am deleting.

#### Acceptance Criteria

1. THE Game_Detail_Page SHALL display a delete button for the loaded game
2. THE delete button SHALL be visually distinct from the edit and status toggle controls to prevent accidental clicks
3. WHILE the game's status is `checked_out`, THE delete button SHALL be disabled
4. WHILE the game's status is `checked_out`, THE Game_Detail_Page SHALL display a message indicating the game must be checked in before it can be deleted

### Requirement 2: Deletion Confirmation Dialog

**User Story:** As a convention organizer, I want to see a warning before a game is deleted, so that I understand the consequences and can cancel if needed.

#### Acceptance Criteria

1. WHEN the organizer clicks the delete button, THE Game_Detail_Page SHALL open the Deletion_Confirmation_Dialog
2. THE Deletion_Confirmation_Dialog SHALL display a warning message stating that the game and all its associated transactions will be permanently deleted
3. WHEN the Transaction_Count is greater than zero, THE Deletion_Confirmation_Dialog SHALL display the Transaction_Count and state that those transactions will be permanently deleted
4. WHEN the Transaction_Count is zero, THE Deletion_Confirmation_Dialog SHALL state that the game has no associated transactions
4. THE Deletion_Confirmation_Dialog SHALL provide a cancel action that closes the dialog without deleting the game
5. THE Deletion_Confirmation_Dialog SHALL provide a confirm action that proceeds with the deletion

### Requirement 3: Password Confirmation for Deletion

**User Story:** As a convention organizer, I want game deletion to require my management password when one is set, so that an unattended browser session cannot be used to permanently destroy data.

#### Acceptance Criteria

1. WHILE a Password_Hash is set, THE Deletion_Confirmation_Dialog SHALL display a password input field
2. WHILE a Password_Hash is set, THE confirm action in the Deletion_Confirmation_Dialog SHALL be disabled until the password field is non-empty
3. WHEN the organizer submits the deletion with an incorrect password, THE Game_Detail_Page SHALL display an error message and not delete the game
4. WHILE no Password_Hash is set, THE Deletion_Confirmation_Dialog SHALL NOT display a password input field and SHALL allow confirmation without a password

### Requirement 4: Cascading Deletion of Game and Transactions

**User Story:** As a convention organizer, I want deleting a game to also remove all its transactions, so that no orphaned transaction records remain in the database.

#### Acceptance Criteria

1. WHEN the deletion is confirmed and all checks pass, THE Game_Deletion_Service SHALL delete all rows from the `transactions` table where `gameId` matches the deleted game
2. WHEN the deletion is confirmed and all checks pass, THE Game_Deletion_Service SHALL delete the row from the `games` table for the specified game
3. THE Game_Deletion_Service SHALL execute the transaction deletion and game deletion within a single database transaction to ensure atomicity
4. WHEN the deletion completes successfully, THE Game_Detail_Page SHALL redirect the organizer to the games list page (`/management/games`)
5. WHEN the deletion completes successfully, THE Game_Detail_Page SHOULD display a success notification

### Requirement 5: Transaction Count Retrieval

**User Story:** As a convention organizer, I want to see how many transactions will be deleted before I confirm, so that I can make an informed decision.

#### Acceptance Criteria

1. WHEN the Game_Detail_Page loads, THE server SHALL retrieve the Transaction_Count for the loaded game
2. THE Transaction_Count SHALL reflect the total number of transaction records (checkouts, checkins, and corrections) associated with the game

### Requirement 7: Real-Time Notification of Deletion

**User Story:** As a convention organizer with multiple browser tabs open, I want other tabs to be notified when a game is deleted, so that stale game data is not displayed.

#### Acceptance Criteria

1. WHEN a game is successfully deleted, THE server SHALL broadcast a `game_deleted` WebSocket event containing the deleted game's ID
2. OTHER connected clients SHALL receive the `game_deleted` event so they can update their views accordingly

### Requirement 8: Error Handling

**User Story:** As a convention organizer, I want clear feedback if the deletion fails, so that I know the game was not deleted and can try again.

#### Acceptance Criteria

1. IF the database operation fails during deletion, THEN THE Game_Detail_Page SHALL display an error message describing the failure
2. IF the game does not exist at the time of deletion, THEN THE Game_Deletion_Service SHALL return a not-found error
3. IF the game's status is `checked_out` at the time of deletion, THEN THE Game_Deletion_Service SHALL reject the deletion and return an error
