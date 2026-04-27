# Board Game Library

A convention board game library management system built with SvelteKit, PostgreSQL, and Docker.

## Quick Start

```bash
docker-compose up
```

Access the application at `https://localhost` (self-signed certificate).

## Development

```bash
npm install
npm run dev
```

## Tech Stack

- **Frontend**: SvelteKit (TypeScript)
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM
- **Reverse Proxy**: Caddy (HTTPS)
- **Notifications**: svelte-french-toast
- **Testing**: Vitest + fast-check (property-based), Playwright (integration)
- **Deployment**: Docker + docker-compose
