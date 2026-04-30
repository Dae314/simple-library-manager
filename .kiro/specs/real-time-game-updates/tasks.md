# Implementation Plan: Real-Time Game Updates

## Overview

This plan implements WebSocket-based real-time update propagation for the Board Game Library. The implementation proceeds in layers: infrastructure and dependencies first, then server-side WebSocket components with their property tests, then client-side components with their property tests, then broadcasting integration into all form actions, then UI features (connection indicator, conflict warning, backup warning), and finally build verification. Property-based tests are written alongside the components they validate.

## Tasks

- [x] 1. Install dependencies and set up server-side core modules
  - [x] 1.1 Add `ws` and `@types/ws` dependencies
    - Add `ws` (^8.18.0) to `dependencies` in `package.json`
    - Add `@types/ws` (^8.5.0) to `devDependencies` in `package.json`
    - Run `npm install`
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Create event types module (`src/lib/server/ws/events.ts`)
    - Define `EventType` union type with all 10 event types: `game_created`, `game_updated`, `game_checked_out`, `game_checked_in`, `game_retired`, `game_restored`, `games_imported`, `games_batch_changed`, `transaction_created`, `full_resync`
    - Define `GameEventMessage`, `BatchGameEventMessage`, `TransactionEventMessage`, `FullResyncMessage` interfaces
    - Define `EventMessage` discriminated union type
    - Export all types
    - _Requirements: 2.2, 2.3, 3.1_

  - [x] 1.3 Create Connection Manager (`src/lib/server/ws/connection-manager.ts`)
    - Implement `ConnectionManager` with a `Set<WebSocket>` for tracking connections
    - Implement `addConnection(ws)`, `removeConnection(ws)`, `broadcast(event)`, `getConnectionCount()`
    - In `broadcast()`, iterate the set, skip and remove connections with `readyState !== WebSocket.OPEN`, call `ws.send(JSON.stringify(event))` for each open connection
    - Wrap individual `ws.send()` calls in try/catch to prevent one failed connection from blocking others
    - Export a singleton `connectionManager` instance
    - _Requirements: 1.2, 1.3, 2.1, 3.1, 7.1, 7.4_

  - [x] 1.4 Write property tests for Connection Manager and event messages (`tests/properties/websocket.prop.test.ts`)
    - **Property 1: Connection Manager add/remove consistency** — Generate random sequences of add/remove operations on mock WebSocket objects. Assert that `getConnectionCount()` equals the number of added-but-not-removed connections. _Validates: Requirements 1.2, 1.3_
    - **Property 3: Broadcast reaches all active connections** — Generate N mock WebSocket connections (0–100) with `readyState === OPEN`. Register all with the Connection Manager, broadcast an event, assert exactly N `send()` calls. _Validates: Requirements 2.1, 3.1_
    - **Property 4: Event message serialization round-trip** — Generate arbitrary valid `EventMessage` objects (all 4 variants) using custom arbitraries. Assert `JSON.parse(JSON.stringify(event))` deep-equals the original. _Validates: Requirements 2.2, 2.3, 3.1_
    - Run `npm run test` to verify these properties pass

  - [x] 1.5 Create broadcast helper functions (`src/lib/server/ws/broadcast.ts`)
    - Implement `broadcastGameEvent(type, gameId)` — constructs a `GameEventMessage` and calls `connectionManager.broadcast()`
    - Implement `broadcastBatchGameEvent(gameIds)` — constructs a `BatchGameEventMessage`
    - Implement `broadcastTransactionEvent(transactionId, gameId)` — constructs a `TransactionEventMessage`
    - Implement `broadcastFullResync()` — constructs a `FullResyncMessage`
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 8.1_

- [x] 2. Implement server-side WebSocket setup and entry points
  - [x] 2.1 Create WebSocket setup module (`src/lib/server/ws/setup.ts`)
    - Implement `setupWebSocketServer(wss: WebSocketServer): void`
    - On `connection` event, register the new WebSocket with the Connection Manager
    - Set up `close` and `error` handlers to remove connections from the Connection Manager
    - Implement ping/pong heartbeat: ping every 30s, close connection if no pong received within 30s
    - _Requirements: 1.2, 1.3, 7.2_

  - [x] 2.2 Create production server entry point (`server.js`)
    - Import `WebSocketServer` from `ws`
    - Import `server` from `./build/index.js` (the adapter-node generated entry point)
    - Access the underlying HTTP server via `server.server`
    - Create `WebSocketServer` with `{ noServer: true }`
    - Listen for `upgrade` events on the HTTP server, filter by `/ws` pathname
    - For `/ws` requests, call `wss.handleUpgrade()` and emit `connection`
    - For non-`/ws` requests, destroy the socket
    - Import and call `setupWebSocketServer(wss)` from the build output
    - Listen for `sveltekit:shutdown` process event to close all WebSocket connections with code 1001 and close the WSS
    - _Requirements: 1.1, 1.2, 7.3_

  - [x] 2.3 Create Vite dev plugin (`src/lib/server/ws/vite-plugin.ts`)
    - Export `webSocketPlugin()` returning a Vite `Plugin`
    - In `configureServer(server)`, create `WebSocketServer` with `{ noServer: true }`
    - Listen for `upgrade` events on `server.httpServer`, filter by `/ws` pathname
    - For `/ws` requests, call `wss.handleUpgrade()` and emit `connection`
    - Do NOT destroy non-`/ws` sockets (Vite HMR needs them)
    - Call `setupWebSocketServer(wss)`
    - _Requirements: 1.1_

  - [x] 2.4 Register Vite plugin in `vite.config.ts`
    - Import `webSocketPlugin` from `./src/lib/server/ws/vite-plugin.js`
    - Add `webSocketPlugin()` to the `plugins` array alongside `sveltekit()`
    - _Requirements: 1.1_

  - [x] 2.5 Update Dockerfile to use `server.js` entry point
    - Add `COPY --from=builder /app/server.js ./server.js` in the production stage
    - Change `CMD ["node", "build"]` to `CMD ["node", "server.js"]`
    - _Requirements: 1.1_

- [x] 3. Checkpoint — Verify server-side WebSocket infrastructure
  - Run `npm run test` to verify all property tests pass
  - Run `npm run build` to verify the build succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement client-side WebSocket module, event handling, and their property tests
  - [ ] 4.1 Create WebSocket client module (`src/lib/stores/websocket.svelte.ts`)
    - Use Svelte 5 runes (`$state()`) for reactive `connected` status
    - Implement `connect()`: construct WebSocket URL from `window.location` using `/ws` path (`wss:` for HTTPS, `ws:` for HTTP)
    - Implement `disconnect()`: close the WebSocket connection and clear timers
    - On `open`: set `connected = true`, reset reconnect attempts, call `invalidateAll()` to sync state after reconnection
    - On `close`: set `connected = false`, trigger reconnection with exponential backoff
    - On `message`: parse JSON, dispatch to event handler
    - Implement exponential backoff: start at 1000ms, multiply by 2 each attempt, cap at 30000ms, reset on successful connection
    - Export a function `calculateReconnectDelay(attempts: number): number` as a pure function for testability
    - Handle errors gracefully: invalid JSON logged and ignored, unknown event types ignored
    - _Requirements: 1.1, 1.4, 1.5, 4.4_

  - [ ] 4.2 Implement event handler with page classification (`src/lib/stores/websocket.svelte.ts`)
    - Define `LIVE_UPDATE_PAGES` array: `/checkout`, `/checkin`, `/catalog`, `/management/games`, `/management/transactions`
    - Define `STATIC_PAGES` array: `/`, `/statistics`, `/management/config`, `/management/backup`, `/management/games/new`
    - Implement `handleEvent(event, pathname, currentEditGameId?)` that returns an action descriptor: `'invalidate'`, `'reload'`, `'conflict'`, or `'ignore'`
    - For `full_resync` events on any page: return `'reload'`
    - For Static_Pages: return `'ignore'`
    - For game edit page (`/management/games/[id]`): if event has `gameId` matching `currentEditGameId`, return `'conflict'`; otherwise return `'invalidate'`
    - For all other Live_Update_Pages: return `'invalidate'`
    - Export `handleEvent` for testability
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 9.1, 9.5_

  - [ ] 4.3 Implement debounce utility for `invalidateAll` calls
    - Create a debounce mechanism (300ms window) that coalesces multiple incoming events into a single `invalidateAll()` call
    - Each incoming event resets the timer
    - When the timer fires, a single `invalidateAll()` call is made
    - Export the debounce function for testability
    - _Requirements: 4.5_

  - [ ] 4.4 Write property tests for client-side logic (`tests/properties/websocket.prop.test.ts`)
    - **Property 2: Reconnection delay calculation** — Generate arbitrary non-negative integers for attempt counts using `fc.nat()`. Assert that `calculateReconnectDelay(attempts)` equals `min(1000 * 2^attempts, 30000)`, is always ≥ 1000ms, and never exceeds 30000ms. _Validates: Requirements 1.4_
    - **Property 5: Live_Update_Pages trigger data reload on any event** — Generate combinations of event types × Live_Update_Page pathnames. Assert `handleEvent()` returns `'invalidate'` (excluding edit page with matching gameId). _Validates: Requirements 4.1, 4.2, 4.3_
    - **Property 6: Static_Pages ignore all events** — Generate combinations of non-full_resync event types × Static_Page pathnames. Assert `handleEvent()` returns `'ignore'`. _Validates: Requirements 4.6, 5.5, 6.4_
    - **Property 7: Debounce coalesces rapid events** — Generate N events (2–50) arriving within the debounce window. Assert exactly 1 `invalidateAll` call is produced, not N. _Validates: Requirements 4.5_
    - **Property 8: Full resync triggers full page reload on any page** — Generate all page pathnames (Live_Update_Pages and Static_Pages). Assert `handleEvent({ type: 'full_resync' }, pathname)` returns `'reload'`. _Validates: Requirements 8.2_
    - **Property 9: Edit page conflict detection based on gameId match** — Generate pairs of (currentGameId, eventGameId) using `fc.nat()`. When IDs match: assert `handleEvent()` returns `'conflict'`. When IDs differ: assert `handleEvent()` returns `'invalidate'`. _Validates: Requirements 9.1, 9.5_
    - Run `npm run test` to verify all properties pass

- [ ] 5. Implement Connection Indicator and page-level integration
  - [ ] 5.1 Create ConnectionIndicator component (`src/lib/components/ConnectionIndicator.svelte`)
    - Accept `connected` boolean prop via `$props()`
    - Render a small dot: green when connected, red/amber when disconnected
    - Include `role="status"` and `aria-live="polite"` for accessibility
    - Include screen-reader-only text: "Live updates active" or "Live updates disconnected"
    - Style with scoped CSS, keep it small and unobtrusive
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 5.2 Integrate WebSocket into root layout (`src/routes/+layout.svelte`)
    - Import the WebSocket client module
    - Initialize the WebSocket connection on mount using `$effect()`
    - Provide `connected` state and event handling via Svelte context so child pages can access it
    - Clean up on unmount by calling `disconnect()`
    - _Requirements: 1.1, 1.4_

  - [ ] 5.3 Add ConnectionIndicator to all Live_Update_Pages
    - Import `ConnectionIndicator` and get WebSocket context in each Live_Update_Page:
      - `src/routes/checkout/+page.svelte`
      - `src/routes/checkin/+page.svelte`
      - `src/routes/catalog/+page.svelte`
      - `src/routes/management/games/+page.svelte`
      - `src/routes/management/games/[id]/+page.svelte`
      - `src/routes/management/transactions/+page.svelte`
    - Render `<ConnectionIndicator connected={wsConnected} />` in each page
    - Ensure Static_Pages do NOT render the indicator
    - _Requirements: 6.1, 6.2, 6.4_

- [ ] 6. Checkpoint — Verify client-side WebSocket, indicator, and all property tests
  - Run `npm run test` to verify all property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Integrate broadcasting into all form actions
  - [ ] 7.1 Add broadcasting to checkout action (`src/routes/checkout/+page.server.ts`)
    - After `transactionService.checkout()` succeeds, call `broadcastGameEvent('game_checked_out', gameId)` and `broadcastTransactionEvent(transactionId, gameId)`
    - Requires the checkout service to return the transaction ID — adjust the return value or extract it
    - _Requirements: 2.1, 2.4, 3.1, 3.2_

  - [ ] 7.2 Add broadcasting to checkin action (`src/routes/checkin/+page.server.ts`)
    - After `transactionService.checkin()` succeeds, call `broadcastGameEvent('game_checked_in', gameId)` and `broadcastTransactionEvent(transactionId, gameId)`
    - _Requirements: 2.1, 2.4, 3.1, 3.2_

  - [ ] 7.3 Add broadcasting to game creation action (`src/routes/management/games/new/+page.server.ts`)
    - After `gameService.create()` succeeds, call `broadcastGameEvent('game_created', createdGame.id)`
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ] 7.4 Add broadcasting to game update action (`src/routes/management/games/[id]/+page.server.ts`)
    - After `gameService.update()` succeeds, call `broadcastGameEvent('game_updated', id)`
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ] 7.5 Add broadcasting to game toggleStatus action (`src/routes/management/games/[id]/+page.server.ts`)
    - After `gameService.toggleStatus()` succeeds, call `broadcastGameEvent('game_updated', id)` and `broadcastTransactionEvent(transactionId, id)`
    - _Requirements: 2.1, 2.4, 3.1, 3.2_

  - [ ] 7.6 Add broadcasting to bulk retire action (`src/routes/management/games/+page.server.ts`)
    - After `gameService.retire()` succeeds, call `broadcastBatchGameEvent(ids)`
    - _Requirements: 2.3, 2.4_

  - [ ] 7.7 Add broadcasting to game restore action (`src/routes/management/games/+page.server.ts`)
    - After `gameService.restore()` succeeds, call `broadcastGameEvent('game_restored', id)`
    - _Requirements: 2.1, 2.4_

  - [ ] 7.8 Add broadcasting to CSV import action (`src/routes/management/games/+page.server.ts`)
    - After `csvService.importGames()` succeeds, call `broadcastBatchGameEvent(importedGameIds)`
    - May need to adjust `csvService.importGames()` to return the list of created game IDs
    - _Requirements: 2.3, 2.4_

  - [ ] 7.9 Add broadcasting to transaction reversal actions (`src/routes/management/transactions/+page.server.ts`)
    - After `transactionService.reverseCheckout()` succeeds, call `broadcastGameEvent('game_checked_in', gameId)` and `broadcastTransactionEvent(transactionId, gameId)`
    - After `transactionService.reverseCheckin()` succeeds, call `broadcastGameEvent('game_checked_out', gameId)` and `broadcastTransactionEvent(transactionId, gameId)`
    - _Requirements: 2.1, 2.4, 3.1, 3.2_

  - [ ] 7.10 Add broadcasting to backup restore action (`src/routes/management/backup/+page.server.ts`)
    - After `backupService.importDatabase()` succeeds, call `broadcastFullResync()`
    - _Requirements: 8.1_

- [ ] 8. Implement edit page conflict warning and backup restore warning
  - [ ] 8.1 Add conflict warning to game edit page (`src/routes/management/games/[id]/+page.svelte`)
    - Track the current game ID from `data.game.id`
    - Listen for WebSocket events where `gameId` matches the current game
    - When a matching event arrives, display a warning banner: "This game was modified by another station. Your form data may be stale."
    - Include a "Reload" button that calls `invalidateAll()` to discard form changes and reload
    - Include a "Dismiss" button that hides the warning and lets the librarian continue editing
    - Use `role="alert"` for accessibility
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 8.2 Update backup restore confirmation dialog warning text (`src/routes/management/backup/+page.svelte`)
    - In the `ConfirmDialog` for database restore, add warning text advising the user to "ensure all librarians stop their activities until the restore is complete"
    - _Requirements: 8.3_

  - [ ] 8.3 Implement full resync handling on the client
    - When a `full_resync` event is received, call `window.location.reload()` on all pages (both Live_Update_Pages and Static_Pages)
    - This is handled in the event handler logic (task 4.2) but ensure it is wired up in the layout-level WebSocket integration
    - _Requirements: 8.2_

- [ ] 9. Write Playwright E2E integration tests for real-time updates
  - [ ] 9.1 Write E2E test: WebSocket connection lifecycle and checkout broadcasting (`tests/integration/realtime-checkout.test.ts`)
    - Open two browser tabs on the checkout page
    - Verify both tabs establish a WebSocket connection (connection indicator shows live)
    - Create a game via `helpers.createGame()`
    - Check out the game on tab 1
    - Verify tab 2 automatically reflects the game as checked out without manual refresh
    - _Requirements: 1.1, 2.1, 2.4, 4.1, 6.1_

  - [ ] 9.2 Write E2E test: checkin broadcasting across tabs (`tests/integration/realtime-checkin.test.ts`)
    - Create and check out a game via helpers
    - Open two browser tabs on the checkin page
    - Check in the game on tab 1
    - Verify tab 2 automatically reflects the game as available without manual refresh
    - _Requirements: 2.1, 2.4, 4.1_

  - [ ] 9.3 Write E2E test: game management changes propagate to catalog and management pages (`tests/integration/realtime-management.test.ts`)
    - Open tab 1 on `/management/games` and tab 2 on `/catalog`
    - Create a new game via the management UI on tab 1
    - Verify the new game appears on tab 2's catalog without manual refresh
    - Edit the game title on tab 1
    - Verify the updated title appears on tab 2 without manual refresh
    - _Requirements: 2.1, 2.2, 2.4, 4.1_

  - [ ] 9.4 Write E2E test: edit page conflict warning (`tests/integration/realtime-conflict.test.ts`)
    - Create a game via helpers
    - Open tab 1 on `/management/games/[id]` (edit page)
    - Modify the game from tab 2 (e.g., update title via the management UI or test API)
    - Verify tab 1 displays the conflict warning banner
    - Verify the "Reload" button refreshes the form data
    - Verify the "Dismiss" button hides the warning
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 9.5 Write E2E test: static pages do not react to events (`tests/integration/realtime-static.test.ts`)
    - Open tab 1 on `/statistics` (a Static_Page)
    - Create and check out a game from tab 2
    - Verify tab 1 does NOT show a connection indicator
    - Verify tab 1's content does not change (no automatic refresh)
    - _Requirements: 4.6, 5.5, 6.4_

  - [ ] 9.6 Write E2E test: connection indicator visibility (`tests/integration/realtime-indicator.test.ts`)
    - Navigate to each Live_Update_Page and verify the connection indicator is visible and shows "live" state
    - Navigate to each Static_Page and verify the connection indicator is NOT present
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ] 9.7 Run full E2E test suite
    - Run `npm run test:e2e` to execute all integration tests against the Dockerized app
    - Verify all new real-time tests pass alongside existing E2E tests
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Final checkpoint — Build verification and full test run
  - Run `npm run build` to verify the production build succeeds
  - Run `npm run test` to verify all property-based tests pass
  - Run `npm run test:e2e` to verify all E2E integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Property-based tests are written alongside the components they validate, not deferred to the end
- E2E integration tests are written after all features are wired up, since they require the full system running in Docker
- Checkpoints ensure incremental validation at natural breakpoints
- Property tests validate universal correctness properties from the design document
- The `ws` library is used for server-side WebSocket; the client uses the native browser WebSocket API
- No database schema changes are required — the WebSocket layer is purely in-memory
- Caddy and docker-compose.yml require no changes — Caddy already handles WebSocket proxying
