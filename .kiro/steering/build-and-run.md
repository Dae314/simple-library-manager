# Build, Run, and Deploy

## Local Development

```bash
npm install
npm run dev             # Start Vite dev server (requires running PostgreSQL)
```

Requires a `.env` file with:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boardgames
```

Optional environment variables:
- `AUTH_SECRET` — HMAC key for session cookies. If unset, a random secret is generated on startup (sessions won't survive restarts).

See `.env.example` for the template.

## Database Commands

```bash
npm run db:generate     # Generate migration SQL from schema changes
npm run db:migrate      # Apply pending migrations
npm run db:studio       # Open Drizzle Studio GUI
```

Migrations are stored in `drizzle/migrations/` and auto-run on app startup via `src/hooks.server.ts`.

**Workflow for schema changes:**
1. Edit `src/lib/server/db/schema.ts`
2. Run `npm run db:generate` to create a migration
3. Run `npm run db:migrate` to apply it (or just restart the app — migrations run on startup)

## Type Checking

```bash
npm run check           # One-shot svelte-check + TypeScript
npm run check:watch     # Watch mode (for local dev only)
```

## Production Build

```bash
npm run build           # Outputs to build/
npm run preview         # Preview the production build locally
```

The production entry point is `server.js` (not the default adapter-node entry). It:
1. Creates a `WebSocketServer` with `{ noServer: true }`
2. Stores it on `globalThis.__wss` so `hooks.server.ts` can wire up connection tracking
3. Imports `./build/index.js` (the adapter-node output) which starts the HTTP server and exports it as `server` (adapter-node 6 exports the `node:http` Server directly; there is no Polka wrapper)
4. Attaches an `upgrade` handler on that HTTP server for the `/ws` path
5. Listens for `sveltekit:shutdown` to gracefully close WebSocket connections

## Docker (Production)

```bash
docker compose up -d              # Start all services (Caddy + App + PostgreSQL)
docker compose down               # Stop services
docker compose down -v            # Stop and destroy database volume
```

Services:
- **caddy** — Reverse proxy on port 80 (plain HTTP, suitable for LAN access at conventions)
- **app** — SvelteKit Node server on port 3000 (internal), started via `server.js`
- **db** — PostgreSQL 17 with health check

The app waits for the database health check before starting. Timezone is set to `Pacific/Honolulu`.

adapter-node 6 removed the `ORIGIN` env var. Because the LAN hostname isn't known at build time, the app derives its origin from Caddy's forwarded headers via `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` (set in both `docker-compose.yml` and `docker-compose.test.yml`). This is only safe because the app port is `expose`d to Caddy and never published. Without `PROTOCOL_HEADER`, adapter-node assumes `https`.

## Project Configuration

- SvelteKit 3 has no `svelte.config.js`; the adapter (`out: 'build'`), `vitePreprocess()` and `csrf.trustedOrigins` are passed to `sveltekit({...})` in `vite.config.ts`.
- `tsconfig.json` extends `$app/tsconfig` and declares explicit `include`/`exclude`.
- `#lib/*` maps to `./src/lib/*` via the package.json `imports` field; it is resolved at build time, so the production image needs nothing extra.
- TypeScript is held at 6.x: SvelteKit 3.1 peers on `typescript ^6` and svelte-check 4.7 does not support TypeScript 7 (the native port has no JS compiler API).

## WebSocket in Development vs Production

| Concern | Development | Production |
|---------|-------------|------------|
| WSS creation | Vite plugin (`src/lib/server/ws/vite-plugin.ts`) | `server.js` before SvelteKit import |
| HTTP upgrade | Plugin hooks into `server.httpServer` | `server.js` hooks into the exported `server` (a `node:http` Server in adapter-node 6) |
| HMR safety | Plugin only handles `/ws` path, leaves other upgrades to Vite | N/A |
| Connection tracking | `setupWebSocketServer()` called by plugin | `initWebSocket()` in `hooks.server.ts` picks up `globalThis.__wss` |

## Testing

```bash
npm run test            # Vitest property-based + unit tests (single run)
npm run test:e2e        # Full E2E: build Docker test env → Playwright → teardown
npm run test:e2e:setup  # Just start the test Docker environment
npm run test:e2e:teardown  # Just tear down the test Docker environment
```

E2E tests use a separate `docker-compose.test.yml` and run against `http://localhost:8080`.
