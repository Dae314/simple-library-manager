# Requirements Document

## Introduction

A convention board game library management system that allows librarians to track the checkout and return of board games during a convention. The system runs as a LAN-based web application served over HTTPS, backed by a PostgreSQL database, with a SvelteKit frontend. It is deployed via Docker and docker-compose on commodity hardware and supports 2–10 connected librarian client computers. Games are cataloged using Board Game Geek (BGG) IDs for external reference. No user authentication is required.

## Glossary

- **Library_System**: The full-stack web application comprising the SvelteKit frontend, backend API, and PostgreSQL database that manages the board game library.
- **Librarian**: A convention volunteer operating one of the connected client computers to check games in and out.
- **Game_Record**: A database entry representing a single physical copy of a board game in the library, including its title, BGG ID, and current availability status.
- **BGG_ID**: A Board Game Geek numeric identifier that uniquely identifies a board game title in the BGG catalog.
- **Checkout_Transaction**: A record capturing the event of a patron borrowing a game, including a timestamp and the game involved.
- **Checkin_Transaction**: A record capturing the event of a patron returning a game, including a timestamp and the game involved.
- **Transaction_Log**: The append-only history of all checkout and checkin events for auditing and error correction.
- **Library_Manager**: A librarian with access to the management area for adding games, editing records, and correcting transaction errors.
- **Statistics_Page**: A read-only dashboard view within the Library_System that displays aggregate metrics and trends derived from Game_Records and the Transaction_Log.
- **Time_Range_Filter**: A user-selectable date range (start date and end date) used to constrain statistics calculations to transactions occurring within that period.
- **Convention_Day**: A numbered day within the convention schedule (e.g., Day 1, Day 2), derived from the convention start date, used to partition statistics by calendar day of the event.
- **Time_Of_Day_Filter**: A user-selectable hour range (e.g., morning 8:00–12:00, afternoon 12:00–17:00, evening 17:00–22:00) used to constrain statistics calculations to transactions occurring within that time window on each day.
- **Checkout_Duration**: The elapsed time between a Checkout_Transaction timestamp and its corresponding Checkin_Transaction timestamp for the same Game_Record, representing how long a game was borrowed.
- **BGG_Title_Group**: An aggregation of all Game_Records that share the same BGG_ID, used to compute statistics across all physical copies of a single board game title.
- **Retired**: A Game_Record status indicating the game has been soft-deleted from active circulation. Retired Game_Records remain in the database but are hidden from checkout and checkin views. A Library_Manager can restore a Retired Game_Record back to "available" status.
- **Attendee**: The convention attendee borrowing a game, identified by first name, last name, and ID type.
- **Checkout_Weight**: The weight of a game recorded at the time of checkout, stored as a positive floating-point value.
- **Checkin_Weight**: The weight of a game recorded at the time of checkin, stored as a positive floating-point value.
- **Weight_Tolerance**: A configurable threshold (floating-point value) for acceptable weight difference between Checkout_Weight and Checkin_Weight.
- **Optimistic_Locking**: A concurrency control strategy where the system verifies that a Game_Record's status has not changed between the time it was displayed and the time a checkout is confirmed, rejecting the operation if a conflict is detected.
- **Convention_Configuration**: System settings configured by a Library_Manager including convention dates, weight tolerance, and weight unit.
- **Weight_Unit**: The unit of measurement for game weights, configurable as ounces (oz), kilograms (kg), or grams (g).
- **Database_Export**: A complete dump of the PostgreSQL database into a downloadable file for backup purposes.
- **Database_Import**: The process of restoring a previously exported database file, replacing all current data.
- **Navigation_Bar**: The persistent navigation element displayed on tablet and desktop viewports containing links to all main pages of the Library_System.
- **Hamburger_Menu**: A collapsible navigation menu used on mobile viewports to contain secondary navigation links (management area, catalog, statistics, configuration).
- **Seed_Data**: A set of 10 example Game_Records with valid BGG_IDs pre-loaded into the database on first run to demonstrate system features.
- **CSV_Import**: The process of creating Game_Records in bulk from an uploaded CSV file containing game titles, BGG_IDs, and copy counts.
- **CSV_Export**: The process of generating a downloadable CSV file containing all current Game_Records with their title, BGG_ID, copy identifier, and status.
- **Game_Type**: A classification for a Game_Record indicating its checkout behavior: "standard" (normal checkout/checkin), "play_and_win" (raffle entry collection on checkin), or "play_and_take" (attendee may keep the game on checkin).
- **Play_And_Win**: A Game_Type where attendees who play the game are entered into a raffle to win it. During checkin, the Librarian is reminded to collect raffle entries.
- **Play_And_Take**: A Game_Type where the attendee may choose to keep the game after playing. During checkin, the Librarian asks if the attendee wants to take the game; if yes, the game is retired.

## Requirements

### Requirement 1: Add a Game to the Library

**User Story:** As a Library_Manager, I want to add a new board game to the library catalog, so that it becomes available for checkout.

#### Acceptance Criteria

1. WHEN a Library_Manager submits a new game with a title and a valid BGG_ID, THE Library_System SHALL create a new Game_Record with a status of "available".
2. WHEN a Library_Manager submits a new game without a title, THE Library_System SHALL reject the submission and display a validation error indicating the title is required.
3. WHEN a Library_Manager submits a new game without a BGG_ID, THE Library_System SHALL reject the submission and display a validation error indicating the BGG_ID is required.
4. THE Library_System SHALL store the BGG_ID as a positive integer on each Game_Record.
5. WHEN a Game_Record is created successfully, THE Library_System SHALL display the new game in the library catalog immediately.

### Requirement 2: Edit a Game Record

**User Story:** As a Library_Manager, I want to edit an existing game's details, so that I can correct mistakes in the catalog.

#### Acceptance Criteria

1. WHEN a Library_Manager updates the title or BGG_ID of an existing Game_Record, THE Library_System SHALL persist the changes and display the updated information.
2. WHEN a Library_Manager submits an edit with an empty title, THE Library_System SHALL reject the edit and display a validation error indicating the title is required.
3. WHEN a Library_Manager submits an edit with an invalid BGG_ID, THE Library_System SHALL reject the edit and display a validation error indicating the BGG_ID must be a positive integer.
4. WHEN a Library_Manager toggles the availability status of a Game_Record, THE Library_System SHALL change the status between "available" and "checked_out" and persist the update immediately.
5. WHEN a Library_Manager toggles a Game_Record status to "available", THE Library_System SHALL create a corrective Checkin_Transaction in the Transaction_Log with a note indicating the status change was a manual override.
6. WHEN a Library_Manager toggles a Game_Record status to "checked_out", THE Library_System SHALL create a corrective Checkout_Transaction in the Transaction_Log with a note indicating the status change was a manual override.

### Requirement 3: Remove a Game from the Library

**User Story:** As a Library_Manager, I want to retire games from the library catalog using a soft-delete approach, so that lost or damaged games no longer appear as available while preserving all historical data.

#### Acceptance Criteria

1. WHEN a Library_Manager requests removal of one or more Game_Records, THE Library_System SHALL change the status of each selected Game_Record to "retired" instead of deleting the record from the database.
2. WHEN a Library_Manager selects multiple Game_Records and requests bulk removal, THE Library_System SHALL retire all selected Game_Records in a single action.
3. WHEN a Library_Manager requests removal of any Game_Records, THE Library_System SHALL display a confirmation dialog before executing the retirement.
4. WHEN a Library_Manager requests removal of Game_Records that include one or more currently checked-out games, THE Library_System SHALL display a specific warning in the confirmation dialog identifying which selected games are currently checked out.
5. WHILE a Game_Record has a status of "retired", THE Library_System SHALL hide the Game_Record from the checkout and checkin views.
6. WHILE a Game_Record has a status of "retired", THE Library_System SHALL display the Game_Record in the management area.
7. THE Library_System SHALL provide a filter in the management area that allows a Library_Manager to show or hide retired Game_Records.
8. WHEN a Library_Manager selects a retired Game_Record and requests restoration, THE Library_System SHALL change the Game_Record status from "retired" to "available".
9. WHEN a Game_Record status is changed to "retired", THE Library_System SHALL preserve all associated Checkout_Transaction and Checkin_Transaction entries in the Transaction_Log.

### Requirement 4: Check Out a Game

**User Story:** As a Librarian, I want to check out a game to an Attendee, so that the library tracks which games are currently borrowed and who borrowed them.

#### Acceptance Criteria

1. WHEN a Librarian selects an available Game_Record and confirms checkout, THE Library_System SHALL change the Game_Record status to "checked_out" and create a Checkout_Transaction with the current timestamp.
2. WHEN a Librarian attempts to check out a Game_Record that is already checked out, THE Library_System SHALL reject the checkout and display a message indicating the game is unavailable.
3. THE Library_System SHALL display the updated availability status of the Game_Record immediately after a successful checkout.
4. THE Library_System SHALL require the Librarian to enter the Attendee first name before completing a checkout.
5. THE Library_System SHALL require the Librarian to enter the Attendee last name before completing a checkout.
6. THE Library_System SHALL require the Librarian to select an ID type (e.g., student ID, driver's license) representing the identification given as collateral before completing a checkout.
7. THE Library_System SHALL require the Librarian to record the Checkout_Weight of the game (as a positive floating-point value) before completing a checkout.
8. IF a Librarian attempts to confirm a checkout without providing the Attendee first name, Attendee last name, ID type, or Checkout_Weight, THEN THE Library_System SHALL reject the checkout and display a validation error identifying the missing fields.
9. WHEN a checkout is completed successfully, THE Library_System SHALL store the Attendee first name, Attendee last name, ID type, and Checkout_Weight on the Checkout_Transaction.
10. THE Library_System SHALL automatically display only Game_Records with a status of "available" on the checkout page.
11. THE Library_System SHALL display the Game_Type alongside the game title for each Game_Record on the checkout page.
12. THE Library_System SHALL provide a search field on the checkout page where the Librarian can type any substring of a game's title to filter the available games list in real-time.
13. IF a Librarian confirms a checkout but another Librarian has already checked out the same Game_Record using Optimistic_Locking, THEN THE Library_System SHALL reject the checkout, display a message indicating the game was just checked out by another station, and refresh the Game_Record status.
14. WHEN a Librarian initiates a checkout, THE Library_System SHALL display an optional free-text note field where the Librarian MAY enter a note (e.g., "box was already damaged", "missing 2 cards noted at checkout").
15. WHEN a checkout is completed with a note, THE Library_System SHALL store the note on the Checkout_Transaction and display the note in the Transaction_Log.

### Requirement 5: Check In a Game

**User Story:** As a Librarian, I want to check in a returned game, so that it becomes available for other Attendees to borrow and the Attendee is reminded to collect their ID.

#### Acceptance Criteria

1. WHEN a Librarian selects a checked-out Game_Record and confirms checkin, THE Library_System SHALL change the Game_Record status to "available" and create a Checkin_Transaction with the current timestamp.
2. WHEN a Librarian attempts to check in a Game_Record that is already available, THE Library_System SHALL reject the checkin and display a message indicating the game is not currently checked out.
3. THE Library_System SHALL display the updated availability status of the Game_Record immediately after a successful checkin.
4. WHEN a Librarian initiates a checkin for a checked-out Game_Record, THE Library_System SHALL display a prominent reminder to the Librarian to return the Attendee's ID (showing the Attendee name and ID type from the corresponding Checkout_Transaction).
5. THE Library_System SHALL require the Librarian to record the Checkin_Weight of the game (as a positive floating-point value) before completing a checkin.
6. WHEN a checkin is completed successfully, THE Library_System SHALL store the Checkin_Weight on the Checkin_Transaction.
7. WHEN a checkin is completed, THE Library_System SHALL compare the Checkin_Weight to the Checkout_Weight from the corresponding Checkout_Transaction and, IF the absolute difference exceeds the configured Weight_Tolerance, THEN THE Library_System SHALL display a dismissible warning to the Librarian indicating that pieces may be missing. The Librarian SHALL be able to acknowledge the warning and proceed with the checkin based on their own judgement; the warning SHALL NOT block the checkin.
8. IF a Librarian attempts to confirm a checkin without providing the Checkin_Weight, THEN THE Library_System SHALL reject the checkin and display a validation error indicating the weight is required.
9. THE Library_System SHALL automatically display only Game_Records with a status of "checked_out" on the checkin page.
10. THE Library_System SHALL display the Attendee name and Checkout_Duration for each checked-out Game_Record on the checkin page.
11. THE Library_System SHALL provide a search field on the checkin page where the Librarian can type any substring of a game's title or the Attendee's name (first or last) to filter the checked-out games list in real-time.
12. WHEN a Librarian initiates a checkin, THE Library_System SHALL display an optional free-text note field where the Librarian MAY enter a note.
13. WHEN a checkin is completed with a note, THE Library_System SHALL store the note on the Checkin_Transaction and display the note in the Transaction_Log.

### Requirement 6: View the Library Catalog

**User Story:** As a Librarian, I want to view all games in the library, so that I can see what is available and what is checked out.

#### Acceptance Criteria

1. THE Library_System SHALL display a list of all Game_Records including title, BGG_ID, and current availability status.
2. THE Library_System SHALL allow filtering the catalog by availability status (available, checked_out).
3. THE Library_System SHALL allow filtering the catalog by Game_Type (standard, play_and_win, play_and_take).
4. THE Library_System SHALL allow searching the catalog by game title.
5. WHEN multiple Librarian clients view the catalog simultaneously, THE Library_System SHALL serve consistent data to all clients within 2 seconds of any status change.

### Requirement 7: View the Transaction Log

**User Story:** As a Library_Manager, I want to view the history of all checkouts and checkins, so that I can audit library activity and identify errors.

#### Acceptance Criteria

1. THE Library_System SHALL display the Transaction_Log as a chronologically ordered list of Checkout_Transaction and Checkin_Transaction entries.
2. THE Library_System SHALL display the game title, transaction type (checkin or checkout), and timestamp for each entry in the Transaction_Log.
3. THE Library_System SHALL allow filtering the Transaction_Log by game title.
4. THE Library_System SHALL allow filtering the Transaction_Log by transaction type.
5. THE Library_System SHALL allow filtering the Transaction_Log by Attendee name (first name, last name, or both).

### Requirement 8: Correct Transaction Errors

**User Story:** As a Library_Manager, I want to undo an erroneous checkout or checkin, so that the game's availability status is corrected.

#### Acceptance Criteria

1. WHEN a Library_Manager selects a Checkout_Transaction and requests a reversal, THE Library_System SHALL change the associated Game_Record status back to "available" and create a corrective Checkin_Transaction with a note indicating it was an error correction.
2. WHEN a Library_Manager selects a Checkin_Transaction and requests a reversal, THE Library_System SHALL change the associated Game_Record status back to "checked_out" and create a corrective Checkout_Transaction with a note indicating it was an error correction.
3. IF a reversal would conflict with the current Game_Record status (e.g., reversing a checkout on a game that has already been checked in by another transaction), THEN THE Library_System SHALL reject the reversal and display an explanation of the conflict.

### Requirement 9: BGG Catalog Lookup

**User Story:** As a Librarian, I want to view the Board Game Geek page for a game, so that I can look up game details such as player count and play time.

#### Acceptance Criteria

1. THE Library_System SHALL display a link to the Board Game Geek page for each Game_Record using the format `https://boardgamegeek.com/boardgame/{BGG_ID}`.
2. WHEN a Librarian clicks the BGG link, THE Library_System SHALL open the BGG page in a new browser tab.

### Requirement 10: Deployment and Networking

**User Story:** As a convention organizer, I want to deploy the system on a single inexpensive computer and serve it over the LAN via HTTPS, so that multiple librarian stations can access it reliably.

#### Acceptance Criteria

1. THE Library_System SHALL be deployable using a single docker-compose file that starts all required services (Caddy reverse proxy, SvelteKit application, PostgreSQL database).
2. THE Library_System SHALL use Caddy as a reverse proxy to terminate HTTPS connections and forward requests to the SvelteKit application over internal HTTP.
3. THE Library_System SHALL use a self-signed TLS certificate generated by Caddy for HTTPS on the LAN.
4. THE Library_System SHALL support 2 to 10 concurrent Librarian client connections without degradation.
5. THE Library_System SHALL persist all data in the PostgreSQL database across container restarts using a Docker volume.
6. THE Library_System SHALL contain all source code, configuration, and deployment files in a single repository.
7. THE Library_System SHALL use the server's local time for all timestamps, dates, and date-based calculations throughout the application.
8. THE Library_System SHALL be implemented in TypeScript for both the SvelteKit frontend and server-side code.
9. THE Library_System SHALL use Drizzle ORM for database schema definition, queries, and migrations.
10. THE Library_System SHALL automatically run any pending database migrations on application startup, requiring no manual intervention from the convention organizer.
11. THE Library_System SHALL use npm as the package manager.
12. THE Library_System SHALL provide a responsive user interface that adapts to laptops, tablets, and phones.

### Requirement 11: Multiple Physical Copies

**User Story:** As a Library_Manager, I want to track multiple physical copies of the same board game title, so that each copy can be independently checked in and out.

#### Acceptance Criteria

1. THE Library_System SHALL allow multiple Game_Records to share the same BGG_ID, each representing a distinct physical copy.
2. WHEN a Game_Record is created, THE Library_System SHALL auto-generate a unique copy identifier (sequential integer) for the Game_Record to distinguish copies of the same title. The copy identifier SHALL NOT be manually entered by the Library_Manager.
3. WHEN displaying Game_Records that share a BGG_ID, THE Library_System SHALL show the copy identifier alongside the title.

### Requirement 12: Library Statistics Page

**User Story:** As a Librarian, I want to view a statistics page showing aggregate library metrics filtered by time range and game title, so that I can understand usage patterns and make informed decisions about the collection.

#### Acceptance Criteria

1. THE Statistics_Page SHALL display the total number of Checkout_Transactions recorded in the Transaction_Log.
2. THE Statistics_Page SHALL display a ranked list of Game_Records ordered by total number of Checkout_Transactions in descending order, showing the game title and checkout count for each entry.
3. THE Statistics_Page SHALL display the current count of Game_Records with a status of "checked_out" and the current count of Game_Records with a status of "available".
4. THE Statistics_Page SHALL display the average number of Checkout_Transactions per day, calculated from the Transaction_Log.
5. THE Statistics_Page SHALL display the Game_Record with the single longest cumulative checked-out duration, calculated from paired Checkout_Transaction and Checkin_Transaction timestamps.
6. WHEN a Librarian applies a Time_Range_Filter, THE Statistics_Page SHALL recalculate all aggregate metrics using only transactions with timestamps within the selected start date and end date (inclusive).
7. WHEN a Librarian enters a game title in the search filter, THE Statistics_Page SHALL recalculate all aggregate metrics using only transactions associated with Game_Records whose title contains the search term.
8. WHEN a Librarian applies both a Time_Range_Filter and a game title filter simultaneously, THE Statistics_Page SHALL recalculate all aggregate metrics using only transactions that satisfy both filter conditions.
9. WHEN no transactions match the active filter criteria, THE Statistics_Page SHALL display zero values for all aggregate metrics and show a message indicating no matching data was found.
10. THE Statistics_Page SHALL update displayed metrics within 2 seconds of a filter change.
11. WHEN a Librarian applies a Time_Of_Day_Filter, THE Statistics_Page SHALL recalculate all aggregate metrics using only transactions with timestamps whose time-of-day component falls within the selected hour range.
12. WHEN a Librarian selects a Convention_Day filter, THE Statistics_Page SHALL recalculate all aggregate metrics using only transactions with timestamps that fall on the selected convention day.
13. WHEN a Librarian enables BGG_Title_Group aggregation, THE Statistics_Page SHALL combine statistics for all Game_Records sharing the same BGG_ID and display results grouped by game title rather than by individual copy.
14. WHEN a Librarian applies an availability status filter, THE Statistics_Page SHALL recalculate all aggregate metrics using only Game_Records whose current status matches the selected value ("available" or "checked_out").
15. WHEN a Librarian applies a Game_Type filter (standard, play_and_win, or play_and_take), THE Statistics_Page SHALL recalculate all aggregate metrics using only Game_Records whose Game_Type matches the selected value.
16. THE Statistics_Page SHALL display the average Checkout_Duration across all completed checkout-checkin pairs in the Transaction_Log.
16. THE Statistics_Page SHALL display the minimum and maximum Checkout_Duration across all completed checkout-checkin pairs in the Transaction_Log.
17. THE Statistics_Page SHALL display a distribution breakdown of Checkout_Duration grouped into configurable time buckets (e.g., under 30 minutes, 30–60 minutes, 1–2 hours, over 2 hours), showing the count of completed checkouts in each bucket.
18. WHEN a Librarian applies any combination of Time_Range_Filter, Time_Of_Day_Filter, Convention_Day filter, game title filter, availability status filter, Game_Type filter, and BGG_Title_Group aggregation simultaneously, THE Statistics_Page SHALL recalculate all aggregate metrics using only transactions and Game_Records that satisfy all active filter conditions.
19. WHEN calculating Checkout_Duration metrics, THE Statistics_Page SHALL use only completed checkout-checkin pairs and SHALL exclude currently checked-out games that have no corresponding Checkin_Transaction.
20. WHEN a Librarian enters an Attendee name in the search filter, THE Statistics_Page SHALL recalculate all aggregate metrics using only transactions associated with the specified Attendee (matching first name, last name, or both).

### Requirement 13: Management Area Filtering

**User Story:** As a Library_Manager, I want robust filtering and sorting capabilities in the management area, so that I can efficiently find and manage games in a large catalog.

#### Acceptance Criteria

1. WHEN a Library_Manager enters text in the title search field, THE Library_System SHALL filter the management area Game_Records to display only those whose title contains the search term (case-insensitive).
2. WHEN a Library_Manager selects an availability status filter value ("available", "checked_out", or "retired"), THE Library_System SHALL filter the management area Game_Records to display only those whose current status matches the selected value.
3. WHEN a Library_Manager selects a Game_Type filter value ("standard", "play_and_win", or "play_and_take"), THE Library_System SHALL filter the management area Game_Records to display only those whose Game_Type matches the selected value.
4. WHEN a Library_Manager enables BGG_Title_Group view, THE Library_System SHALL group all Game_Records sharing the same BGG_ID together and display them under a single heading showing the shared title.
5. WHEN a Library_Manager selects a sort option, THE Library_System SHALL order the management area Game_Records by the selected field: title (alphabetical), BGG_ID (numeric), availability status (alphabetical), Game_Type (alphabetical), or last transaction date (chronological, most recent first).
6. WHEN a Library_Manager sets a "games added since" date filter, THE Library_System SHALL filter the management area Game_Records to display only those created on or after the specified date.
7. WHEN a Library_Manager sets a "last checked out before" date filter, THE Library_System SHALL filter the management area Game_Records to display only those whose most recent Checkout_Transaction timestamp is on or before the specified date.
8. WHEN a Library_Manager sets a last transaction date range filter (start date and end date), THE Library_System SHALL filter the management area Game_Records to display only those whose most recent transaction timestamp falls within the specified range (inclusive).
9. WHEN a Library_Manager applies any combination of title search, availability status filter, Game_Type filter, BGG_Title_Group view, sort option, and date-based filters simultaneously, THE Library_System SHALL apply all active filters together and display only Game_Records that satisfy every active filter condition.
10. WHEN any filter or sort option is changed in the management area, THE Library_System SHALL update the displayed results within 2 seconds of the filter change.

### Requirement 14: Convention Configuration

**User Story:** As a Library_Manager, I want to configure convention-wide settings such as convention dates, weight tolerance, and weight unit, so that the system behaves consistently and reflects the current convention's parameters.

#### Acceptance Criteria

1. THE Library_System SHALL provide a Convention_Configuration page accessible from the management area.
2. WHEN a Library_Manager sets the convention name in the Convention_Configuration, THE Library_System SHALL persist the name and display it in the application header/title bar.
3. WHEN a Library_Manager sets the convention start date and end date in the Convention_Configuration, THE Library_System SHALL persist the dates and use them to derive Convention_Day values for the Statistics_Page.
3. WHEN a Library_Manager sets the Weight_Tolerance value in the Convention_Configuration, THE Library_System SHALL persist the value and use it for all subsequent checkin weight comparisons.
4. WHEN a Library_Manager selects a Weight_Unit (oz, kg, or g) in the Convention_Configuration, THE Library_System SHALL persist the selection and display all weight values throughout the Library_System in the selected Weight_Unit.
5. THE Library_System SHALL persist all Convention_Configuration settings in the PostgreSQL database so that values survive container restarts.
6. IF a Library_Manager submits the Convention_Configuration with an end date earlier than the start date, THEN THE Library_System SHALL reject the submission and display a validation error indicating the end date must be on or after the start date.
7. IF a Library_Manager submits the Convention_Configuration with a non-positive Weight_Tolerance value, THEN THE Library_System SHALL reject the submission and display a validation error indicating the Weight_Tolerance must be a positive number.
8. THE Library_System SHALL allow a Library_Manager to configure the list of accepted ID types (e.g., student ID, driver's license, passport) in the Convention_Configuration.
9. WHEN a Library_Manager has configured accepted ID types, THE Library_System SHALL display the configured ID types as selectable options in the checkout form's ID type field.
10. THE Library_System SHALL allow a Library_Manager to add and remove ID types from the accepted ID types list at any time.

### Requirement 15: Data Backup and Restore

**User Story:** As a Library_Manager, I want to export the entire database to a file and restore from a previously exported file, so that I can back up convention data and recover from data loss.

#### Acceptance Criteria

1. WHEN a Library_Manager requests a Database_Export from the management area, THE Library_System SHALL generate a complete dump of the PostgreSQL database and provide it as a downloadable file.
2. THE Library_System SHALL produce a Database_Export file that is self-contained and can be restored on a fresh Library_System instance with no additional dependencies.
3. WHEN a Library_Manager uploads a Database_Import file in the management area and confirms the import, THE Library_System SHALL restore the database from the uploaded file, replacing all existing data.
4. WHEN a Library_Manager initiates a Database_Import, THE Library_System SHALL display a confirmation dialog warning that the import will overwrite all existing data before proceeding.
5. IF a Library_Manager uploads an invalid or corrupted Database_Import file, THEN THE Library_System SHALL reject the import and display an error message indicating the file is not a valid database export.
6. WHEN a Database_Export is completed successfully, THE Library_System SHALL display a confirmation message indicating the export file is ready for download.
7. WHEN a Database_Import is completed successfully, THE Library_System SHALL display a confirmation message indicating the data has been restored.

### Requirement 16: Pagination

**User Story:** As a Librarian, I want all list views to support pagination, so that I can navigate large datasets efficiently without performance degradation.

#### Acceptance Criteria

1. THE Library_System SHALL paginate the library catalog, Transaction_Log, management area game list, and Statistics_Page ranked lists.
2. THE Library_System SHALL allow the user to configure the number of items displayed per page.
3. THE Library_System SHALL display page navigation controls (next page, previous page, and page number selection) on all paginated views.
4. THE Library_System SHALL display the total number of results matching the current filter criteria on all paginated views.
5. WHEN a user applies or changes a filter on a paginated view, THE Library_System SHALL reset the view to the first page of the filtered results and apply pagination to the filtered result set.
6. WHEN a user navigates to a different page, THE Library_System SHALL display the corresponding page of results within 2 seconds.

### Requirement 17: Navigation

**User Story:** As a Librarian, I want a clear and consistent navigation structure, so that I can quickly access the pages I need regardless of my device.

#### Acceptance Criteria

1. WHILE the Library_System is displayed on a tablet or desktop viewport, THE Library_System SHALL display a persistent Navigation_Bar with links to all main pages: checkout, checkin, catalog, statistics, and management.
2. WHILE the Library_System is displayed on a mobile viewport, THE Library_System SHALL display checkout and checkin links in an easily accessible Navigation_Bar.
3. WHILE the Library_System is displayed on a mobile viewport, THE Library_System SHALL place management area, catalog, statistics, and configuration links inside a Hamburger_Menu.
4. THE Library_System SHALL visually indicate which page is currently active in the Navigation_Bar or Hamburger_Menu.

### Requirement 18: Seed Data / First-Run Experience

**User Story:** As a Library_Manager, I want the system to come pre-loaded with example games on first run, so that I can explore the system's features before adding real games.

#### Acceptance Criteria

1. WHEN the Library_System starts and the database contains no Game_Records, THE Library_System SHALL seed the database with 10 example Game_Records using valid BGG_IDs.
2. THE Seed_Data SHALL include a variety of game titles and SHALL include at least two titles with multiple copies sharing the same BGG_ID to demonstrate the multiple-copies feature.
3. THE Seed_Data SHALL include at least one Game_Record with a Game_Type of "play_and_win" and at least one Game_Record with a Game_Type of "play_and_take" to demonstrate those features.
4. WHEN a Library_Manager removes all Seed_Data Game_Records, THE Library_System SHALL allow the removal using the standard Game_Record retirement process described in Requirement 3.

### Requirement 19: CSV Import and Export for Games

**User Story:** As a Library_Manager, I want to import games from a CSV file and export the current game list as a CSV file, so that I can manage games in bulk efficiently.

#### Acceptance Criteria

1. WHEN a Library_Manager uploads a CSV file for CSV_Import, THE Library_System SHALL accept a CSV file with columns: title, BGG_ID, and copy count.
2. WHEN a Library_Manager uploads a CSV file for CSV_Import, THE Library_System SHALL validate the CSV contents and report all errors (missing titles, invalid BGG_IDs, non-positive copy counts) before importing any records.
3. IF the CSV file contains validation errors, THEN THE Library_System SHALL display the list of errors to the Library_Manager and SHALL NOT import any records until the errors are resolved.
4. WHEN the CSV file passes validation, THE Library_System SHALL display a confirmation dialog showing the number of Game_Records to be created and require the Library_Manager to confirm before importing.
5. WHEN a Library_Manager confirms a valid CSV_Import, THE Library_System SHALL create Game_Records for each row in the CSV, generating the specified number of copies per title.
6. WHEN a Library_Manager requests a CSV_Export, THE Library_System SHALL generate a downloadable CSV file containing all Game_Records with columns: title, BGG_ID, copy identifier, and status.

### Requirement 20: Play & Win and Play & Take Games

**User Story:** As a Library_Manager, I want to classify games as "Play & Win" or "Play & Take" so that librarians receive appropriate prompts during checkin and attendees can win or take home special games.

#### Acceptance Criteria

1. THE Library_System SHALL support a Game_Type field on each Game_Record with possible values: "standard", "play_and_win", or "play_and_take", defaulting to "standard".
2. WHEN a Library_Manager adds a new Game_Record in the management area, THE Library_System SHALL display a Game_Type selector allowing the Library_Manager to set the Game_Type to "standard", "play_and_win", or "play_and_take".
3. WHEN a Library_Manager edits an existing Game_Record in the management area, THE Library_System SHALL allow the Library_Manager to change the Game_Type.
4. THE Library_System SHALL display the Game_Type alongside the game title in all views where the Game_Record appears (catalog, checkout, checkin, management area, and statistics).
5. WHEN a Librarian initiates a checkin for a Game_Record with a Game_Type of "play_and_win", THE Library_System SHALL display a prominent reminder, visually distinct from other checkin prompts, instructing the Librarian to collect raffle entries from all attendees who played the game.
6. WHEN a Librarian initiates a checkin for a Game_Record with a Game_Type of "play_and_take", THE Library_System SHALL ask the Librarian whether the Attendee wants to take the game.
7. IF the Librarian confirms the Attendee wants to take a "play_and_take" game during checkin, THEN THE Library_System SHALL change the Game_Record status to "retired" with a note indicating the game was taken by the Attendee.
8. IF the Librarian indicates the Attendee does not want to take a "play_and_take" game during checkin, THEN THE Library_System SHALL proceed with normal checkin and change the Game_Record status to "available".
