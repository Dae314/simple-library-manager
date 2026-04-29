# Board Game Library

A convention board game library management system for tracking game checkouts, checkins, and inventory at tabletop gaming conventions. Built with SvelteKit, PostgreSQL, and Docker.

## Features

- **Checkout / Checkin** — Track who has which games, with attendee identification and weight-based verification
- **Game Catalog** — Browse available and checked-out games with filtering by status, game type, and title search
- **Game Management** — Add, edit, retire/restore games; bulk operations; CSV import/export
- **Transaction Log** — Full audit trail of all checkouts, checkins, and reversals
- **Statistics** — Aggregated metrics including checkout counts, duration analysis, top games, and filterable time-based breakdowns
- **Convention Configuration** — Set convention name, dates, weight tolerance, ID types, and weight units
- **Database Backup** — Export and import full database backups via pg_dump/pg_restore
- **Game Types** — Supports standard, play-and-win, and play-and-take game workflows
- **Optimistic Locking** — Prevents conflicts when multiple operators work simultaneously

## Pre-requisites

- [Docker](https://docs.docker.com/get-docker/) (v20+ recommended)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+ recommended, included with Docker Desktop)

That's it. All other dependencies (Node.js, PostgreSQL, Caddy) are handled by the Docker containers.

### For local development (without Docker)

- [Node.js](https://nodejs.org/) v24+
- [PostgreSQL](https://www.postgresql.org/) 17
- npm (comes with Node.js)

## Running in Production

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd board-game-library
   ```

2. (Optional) Review the default configuration in `docker-compose.yml`. The defaults work out of the box, but you can adjust the PostgreSQL credentials if needed.

3. Start the application:

   ```bash
   docker compose up -d
   ```

   This builds the SvelteKit app, starts PostgreSQL, and puts Caddy in front as a reverse proxy on port 80.

4. Access the application at **http://localhost** (or **http://\<host-ip\>** from other devices on the LAN).

   At a convention, clients on the local network can connect using the host machine's IP address.

5. On first startup, the database migrations run automatically and seed data (10 example games) is loaded.

### Stopping the application

```bash
docker compose down
```

To also remove the database volume (destroys all data):

```bash
docker compose down -v
```

## Tech Stack

- **Frontend**: SvelteKit 2 with Svelte 5 (TypeScript)
- **Database**: PostgreSQL 17
- **ORM**: Drizzle ORM
- **Reverse Proxy**: Caddy (HTTP)
- **Notifications**: svelte-hot-french-toast
- **Testing**: Vitest + fast-check (property-based), Playwright (E2E)
- **Deployment**: Docker + Docker Compose

## Development

```bash
npm install
npm run dev
```

Requires a running PostgreSQL instance. Set the connection string in a `.env` file (see `.env.example`):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boardgames
```

### Database commands

```bash
npm run db:generate   # Generate migration from schema changes
npm run db:migrate    # Apply pending migrations
npm run db:studio     # Open Drizzle Studio (database GUI)
```

### Testing

```bash
npm run test          # Unit/property tests (Vitest)
npm run test:e2e      # End-to-end tests (Playwright + Docker)
```
