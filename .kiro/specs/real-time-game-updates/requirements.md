# Requirements Document

## Introduction

The Board Game Library currently requires librarians to manually refresh their browser to see changes made by other stations. At a busy convention with multiple librarians working simultaneously, this leads to stale data — a librarian might try to check out a game that was already checked out seconds ago by another station, or miss a newly added game. This feature adds real-time update propagation so that game checkout, checkin, creation, and management changes are automatically pushed to all connected clients without requiring a page refresh. Configuration changes (convention name, dates, ID types, weight settings) are excluded from real-time updates since they are set up before the convention and rarely change during operation.

## Glossary

- **Server**: The SvelteKit Node.js application running within the Docker container, serving HTTP requests and managing WebSocket connections
- **Client**: A browser tab connected to the Board Game Library application, used by a librarian or library manager at a convention station
- **WebSocket_Connection**: A persistent, bidirectional communication channel between a Client and the Server, used to push real-time updates
- **Event_Message**: A JSON-formatted message sent from the Server to connected Clients over a WebSocket_Connection, describing a data change
- **Game_Mutation**: Any server-side operation that creates, updates, or changes the status of a game record, including checkout, checkin, creation, editing, retirement, restoration, CSV import, and manual status toggle
- **Transaction_Mutation**: Any server-side operation that creates a new transaction record, including checkout, checkin, and correction transactions
- **Connection_Manager**: The server-side module responsible for tracking active WebSocket_Connections and broadcasting Event_Messages to them
- **Debounce_Window**: A short time interval (200–500 milliseconds) during which the Client coalesces multiple incoming Event_Messages into a single `invalidateAll` call, preventing redundant data reloads during rapid-fire events such as CSV import or rapid checkout/checkin activity
- **Full_Resync**: A special Event_Message type with type "full_resync" that indicates the entire database has been replaced (e.g., after a backup restore) and all connected Clients must perform a full page reload to ensure all data including layout-level data is refreshed
- **Live_Update_Page**: A page that displays operational data affected by Game_Mutations or Transaction_Mutations and reacts to incoming Event_Messages — specifically the checkout page (`/checkout`), checkin page (`/checkin`), catalog page (`/catalog`), management games list page (`/management/games`), management game edit page (`/management/games/[id]`), and management transactions page (`/management/transactions`)
- **Static_Page**: A page that does not react to incoming Event_Messages — specifically the home/dashboard (`/`), statistics page (`/statistics`), management config page (`/management/config`), management backup page (`/management/backup`), and management games new page (`/management/games/new`)

## Requirements

### Requirement 1: WebSocket Connection Lifecycle

**User Story:** As a librarian, I want my browser to automatically establish and maintain a real-time connection to the server, so that I receive updates without any manual action.

#### Acceptance Criteria

1. WHEN a Client loads any page, THE Client SHALL establish a WebSocket_Connection to the Server
2. WHEN a WebSocket_Connection is established, THE Connection_Manager SHALL register the connection for receiving Event_Messages
3. WHEN a WebSocket_Connection is closed, THE Connection_Manager SHALL remove the connection from the set of active connections
4. IF a WebSocket_Connection drops unexpectedly, THEN THE Client SHALL attempt to reconnect using exponential backoff with a minimum delay of 1 second and a maximum delay of 30 seconds
5. WHEN a WebSocket_Connection is re-established after a disconnection, THE Client SHALL reload the current page data to synchronize state

### Requirement 2: Game Change Broadcasting

**User Story:** As a librarian, I want to see game changes made by other stations appear automatically, so that I always have an accurate view of the library inventory.

#### Acceptance Criteria

1. WHEN a Game_Mutation occurs on the Server, THE Connection_Manager SHALL broadcast an Event_Message containing the event type and the affected game identifier to all active WebSocket_Connections
2. THE Event_Message SHALL include a "type" field indicating the kind of change (game_created, game_updated, game_checked_out, game_checked_in, game_retired, game_restored, games_imported) and a "gameId" field identifying the affected game
3. WHEN a batch Game_Mutation occurs (CSV import or bulk retire), THE Connection_Manager SHALL broadcast a single Event_Message with the type "games_batch_changed" and an array of affected game identifiers
4. THE Server SHALL broadcast Event_Messages for Game_Mutations originating from checkout, checkin, game creation, game editing, game retirement, game restoration, CSV import, and manual status toggle operations

### Requirement 3: Transaction Change Broadcasting

**User Story:** As a librarian viewing the transaction log, I want new transactions to appear automatically, so that I can monitor library activity in real time.

#### Acceptance Criteria

1. WHEN a Transaction_Mutation occurs on the Server, THE Connection_Manager SHALL broadcast an Event_Message with type "transaction_created" and the affected transaction identifier to all active WebSocket_Connections
2. THE Server SHALL broadcast transaction Event_Messages for checkout, checkin, and correction transactions

### Requirement 4: Client-Side Data Refresh on Update

**User Story:** As a librarian, I want my current page to reflect real-time changes, so that I do not act on stale information.

#### Acceptance Criteria

1. WHEN a Client on a Live_Update_Page receives a game-related Event_Message, THE Client SHALL use SvelteKit's `invalidateAll` function to reload the current page's server data
2. WHEN a Client on a Live_Update_Page receives a transaction-related Event_Message, THE Client SHALL use SvelteKit's `invalidateAll` function to reload the current page's server data
3. WHEN a Client on a Live_Update_Page receives a "games_batch_changed" Event_Message, THE Client SHALL use SvelteKit's `invalidateAll` function to reload the current page's server data
4. WHEN the Client receives an Event_Message, THE Client SHALL NOT navigate away from the current page or reset locally-held form input values; SvelteKit's `invalidateAll` reloads server load data in place while preserving client-side component state
5. WHEN multiple Event_Messages arrive within a Debounce_Window, THE Client SHALL coalesce them into a single `invalidateAll` call instead of triggering one reload per message
6. WHEN a Client is on a Static_Page, THE Client SHALL ignore incoming Event_Messages and SHALL NOT call `invalidateAll`

### Requirement 5: Exclusion of Non-Operational Data

**User Story:** As a library manager, I want configuration changes and aggregate statistics to remain manual-refresh only, so that the real-time system focuses on high-frequency operational data.

#### Acceptance Criteria

1. WHEN a convention configuration change occurs (convention name, start date, end date, weight tolerance, weight unit), THE Server SHALL NOT broadcast an Event_Message
2. WHEN an ID type is added or removed, THE Server SHALL NOT broadcast an Event_Message
3. THE Server SHALL limit real-time broadcasting to Game_Mutations and Transaction_Mutations only
4. THE Server SHALL NOT broadcast Event_Messages for statistics aggregation; the statistics page SHALL require a manual browser refresh to display updated data
5. WHEN a Client is on the statistics page, THE Client SHALL NOT invoke `invalidateAll` in response to any incoming Event_Message

### Requirement 6: Connection Indicator

**User Story:** As a librarian, I want to see whether my real-time connection is active on pages that receive live updates, so that I know if I need to manually refresh.

#### Acceptance Criteria

1. WHILE a WebSocket_Connection is active and the Client is on a Live_Update_Page, THE Client SHALL display a small, unobtrusive visual indicator showing the connection is live
2. WHILE a WebSocket_Connection is disconnected or reconnecting and the Client is on a Live_Update_Page, THE Client SHALL display a small, unobtrusive visual indicator showing the connection is lost
3. WHEN a WebSocket_Connection transitions between connected and disconnected states, THE Client SHALL update the visual indicator within 1 second of the state change
4. WHEN a Client is on a Static_Page, THE Client SHALL NOT display the connection indicator

### Requirement 7: Server-Side Connection Management

**User Story:** As a system operator, I want the server to efficiently manage WebSocket connections, so that the system remains stable under convention load.

#### Acceptance Criteria

1. THE Connection_Manager SHALL support a minimum of 50 concurrent WebSocket_Connections
2. WHEN a Client fails to respond to a WebSocket ping within 30 seconds, THE Connection_Manager SHALL close the unresponsive connection and remove it from the active set
3. IF the Server process restarts, THEN THE Connection_Manager SHALL start with an empty connection set and accept new connections from reconnecting Clients
4. THE Connection_Manager SHALL broadcast Event_Messages to all active connections in under 100 milliseconds from the time the originating mutation completes
5. THE Server SHALL NOT guarantee ordering of Event_Messages delivered to Clients; ordering is not required because each Event_Message triggers a full data reload via `invalidateAll`, making the order of individual events irrelevant

### Requirement 8: Backup Restore Broadcasting

**User Story:** As a librarian, I want all connected stations to automatically reload after a database restore, so that every station reflects the restored data and no one operates on stale pre-restore information.

#### Acceptance Criteria

1. WHEN a database restore completes successfully, THE Server SHALL broadcast a Full_Resync Event_Message to all active WebSocket_Connections
2. WHEN a Client receives a Full_Resync Event_Message, THE Client SHALL perform a full page reload (not `invalidateAll`) to ensure all data including layout-level data loaded in the root layout is refreshed
3. THE backup restore confirmation dialog on the management backup page (`/management/backup`) SHALL include a warning advising the user to "ensure all librarians stop their activities until the restore is complete"

### Requirement 9: Edit Page Conflict Warning

**User Story:** As a librarian editing a game, I want to be warned if another station modifies the same game while I am editing it, so that I can decide whether to reload or continue with my changes.

#### Acceptance Criteria

1. WHEN a Client is on the game edit page (`/management/games/[id]`) and receives a game-related Event_Message where the gameId matches the game currently being edited, THE Client SHALL display a warning notification informing the librarian that the game was modified by another station
2. THE warning notification SHALL advise the librarian that the current form data may be stale
3. THE warning notification SHALL provide the librarian with an option to reload the latest data, which discards the current form changes
4. THE warning notification SHALL provide the librarian with an option to dismiss the warning and continue editing, relying on optimistic locking to catch conflicts at save time
5. WHEN a Client is on the game edit page and receives a game-related Event_Message where the gameId does not match the game currently being edited, THE Client SHALL use SvelteKit's `invalidateAll` function as normal without displaying a conflict warning
