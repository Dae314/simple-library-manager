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

## Docker (Production)

```bash
docker compose up -d              # Start all services (Caddy + App + PostgreSQL)
docker compose down               # Stop services
docker compose down -v            # Stop and destroy database volume
```

Services:
- **caddy** — Reverse proxy with self-signed TLS on ports 80/443
- **app** — SvelteKit Node server on port 3000 (internal)
- **db** — PostgreSQL 17 with health check

The app waits for the database health check before starting.

## Testing

```bash
npm run test            # Vitest property-based + unit tests (single run)
npm run test:e2e        # Full E2E: build Docker test env → Playwright → teardown
npm run test:e2e:setup  # Just start the test Docker environment
npm run test:e2e:teardown  # Just tear down the test Docker environment
```

E2E tests use a separate `docker-compose.test.yml` and run against `http://localhost:8080`.
