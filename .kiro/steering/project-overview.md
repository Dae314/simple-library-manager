# Board Game Library — Project Overview

This is a convention board game library management system for tracking game checkouts, checkins, and inventory at tabletop gaming conventions.

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5 (TypeScript, `$props()` / `$derived()` runes)
- **Database**: PostgreSQL 17 via Drizzle ORM
- **Adapter**: `@sveltejs/adapter-node` (output to `build/`)
- **Real-time**: WebSocket (`ws` library) with custom Vite plugin for dev, standalone `server.js` for production
- **Auth**: bcryptjs for password hashing, HMAC session cookies
- **Styling**: Plain CSS with scoped `<style>` blocks in Svelte components; CSS variables defined in `src/app.css`
- **Notifications**: `svelte-hot-french-toast` (Toaster in root layout)
- **CSV**: `papaparse` for CSV import/export
- **Testing**: Vitest + fast-check (property-based), Playwright (E2E via Docker)
- **Deployment**: Docker Compose (Caddy reverse proxy + Node app + PostgreSQL)

## Project Structure

```
src/
├── app.css                        # Global CSS variables and resets
├── app.html                       # HTML shell
├── hooks.server.ts                # Runs migrations, seed, and WebSocket init on startup
├── lib/
│   ├── components/                # Reusable Svelte 5 components (14 total)
│   │   ├── BarChart.svelte        # Statistics visualization
│   │   ├── CheckinDialog.svelte   # Modal dialog for checkin flow
│   │   ├── CheckoutDialog.svelte  # Modal dialog for checkout flow
│   │   ├── ConfirmDialog.svelte   # Generic confirmation modal
│   │   ├── ConnectionIndicator.svelte  # WebSocket connection status dot
│   │   ├── FilterPanel.svelte     # Reusable filter controls
│   │   ├── GameCard.svelte        # Game display card
│   │   ├── GameTypeBadge.svelte   # Colored badge for game types
│   │   ├── Navbar.svelte          # Top navigation bar
│   │   ├── Pagination.svelte      # Page navigation controls
│   │   ├── SearchFilter.svelte    # Search input with debounce
│   │   ├── SortableTable.svelte   # Table with sortable column headers
│   │   └── WeightWarning.svelte   # Weight discrepancy alert
│   ├── server/
│   │   ├── db/
│   │   │   ├── index.ts           # Drizzle client (pg Pool)
│   │   │   ├── schema.ts          # Drizzle table definitions
│   │   │   └── seed.ts            # Seed data for first run
│   │   ├── services/              # Business logic layer
│   │   │   ├── auth.ts            # Password hashing, sessions, rate limiting
│   │   │   ├── backup.ts          # Database export/import
│   │   │   ├── config.ts          # Convention configuration CRUD
│   │   │   ├── csv.ts             # CSV validation and import/export
│   │   │   ├── db-errors.ts       # Database error classification
│   │   │   ├── games.ts           # Game CRUD, filtering, pagination, library queries
│   │   │   ├── statistics.ts      # Analytics: metrics, time distribution, duration analysis
│   │   │   └── transactions.ts    # Checkout/checkin logic with weight verification
│   │   ├── validation.ts          # Server-side input validation functions
│   │   └── ws/                    # WebSocket server modules
│   │       ├── broadcast.ts       # Helper functions to emit typed events
│   │       ├── connection-manager.ts  # Tracks active WebSocket connections
│   │       ├── events.ts          # TypeScript event type definitions
│   │       ├── setup.ts           # Wires connection tracking + heartbeat
│   │       └── vite-plugin.ts     # Vite plugin for dev-mode WebSocket
│   ├── stores/
│   │   └── websocket.svelte.ts    # Client-side WebSocket with reconnection, debouncing, conflict detection
│   └── utils/
│       ├── formatting.ts          # Display formatting helpers
│       ├── page-size.ts           # Persistent page size preference
│       └── validation.ts          # Client-side validation helpers
├── routes/
│   ├── +layout.server.ts          # Root load: convention config
│   ├── +layout.svelte             # Shell: Navbar + Toaster + WebSocket client + <main>
│   ├── +page.svelte               # Home / dashboard
│   ├── library/                   # Game catalog with inline checkout/checkin dialogs
│   ├── management/                # Admin area (password-protected)
│   │   ├── +layout.server.ts      # Auth guard for management routes
│   │   ├── +page.server.ts        # Dashboard counts + login action
│   │   ├── games/                 # CRUD for games (list, new, [id] edit)
│   │   ├── transactions/          # Transaction log with filtering
│   │   ├── statistics/            # Analytics dashboard with charts
│   │   ├── config/                # Convention settings
│   │   └── backup/                # DB export/import + CSV
│   └── api/                       # JSON endpoints (backup export, test helpers)
server.js                          # Production entry: WebSocket + adapter-node
tests/
├── properties/                    # Property-based tests (fast-check) — 12 files
└── integration/                   # Playwright E2E tests — 24 files
drizzle/
└── migrations/                    # SQL migration files (generated by drizzle-kit)
```

## Database Schema (Drizzle)

Defined in `src/lib/server/db/schema.ts`:

| Table               | Purpose                                      |
|---------------------|----------------------------------------------|
| `convention_config` | Single-row convention settings (name, dates, weight tolerance, weight unit, passwordHash) with optimistic locking `version` |
| `id_types`          | Configurable attendee ID types               |
| `games`             | Game inventory (title, bggId, copyNumber, status, gameType, version) with indexes on bggId, status, gameType |
| `transactions`      | Audit log of checkouts, checkins, corrections with indexes on gameId, type, createdAt, attendee |

Key relationships:
- `transactions.gameId` → `games.id`
- `transactions.relatedTransactionId` → self-referencing for corrections

## Domain Concepts

- **Game statuses**: `available`, `checked_out`, `retired`
- **Game types**: `standard`, `play_and_win`, `play_and_take`
- **Optimistic locking**: Games and config use a `version` column; updates check version match to prevent conflicts
- **Weight verification**: Games are weighed at checkout and checkin; discrepancies beyond the configured tolerance trigger a warning
- **Corrections**: Manual status overrides create corrective transactions with `isCorrection: true`
- **Copy numbers**: Auto-generated as MAX+1 per BGG ID within a transaction
- **Authentication**: Management area is password-protected with bcrypt + HMAC session cookies
- **Rate limiting**: Failed login attempts incur progressive delays (1–5 seconds), expiring after 15 minutes

## Real-Time Updates (WebSocket)

The app uses WebSocket for live updates across all connected clients:

- **Server**: `ws` library with `{ noServer: true }` mode, handling upgrades on `/ws` path
- **Production**: `server.js` creates the WebSocketServer before importing the SvelteKit build, attaches upgrade handler to the HTTP server
- **Development**: Vite plugin (`webSocketPlugin()`) attaches to the dev server without interfering with Vite's HMR WebSocket
- **Client**: Svelte runes-based store (`websocket.svelte.ts`) with exponential backoff reconnection, debounced `invalidateAll()`, and conflict detection
- **Event types**: `game_created`, `game_updated`, `game_deleted`, `game_checked_out`, `game_checked_in`, `game_retired`, `game_restored`, `games_imported`, `games_batch_changed`, `transaction_created`, `full_resync`
- **Page routing**: Pages are classified as "live update" (library, games list, transactions) or "static" (statistics, config, backup). Only live-update pages react to events; `full_resync` triggers a reload on all pages.
- **Conflict detection**: Game edit pages detect when the currently-edited game is modified by another user and show a warning
- **Heartbeat**: Server pings every 30 seconds; unresponsive clients are terminated
