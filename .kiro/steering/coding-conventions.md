# Coding Conventions

## TypeScript

- Strict mode enabled (`"strict": true` in tsconfig)
- Use `type` imports for type-only references: `import type { PageServerLoad } from './$types'`
- Prefer `interface` for object shapes, `type` for unions and aliases
- Use `.js` extensions in relative imports (required by ESM): `import { db } from '../db/index.js'`
- Module resolution is `bundler`; use `$lib/` alias for `src/lib/` imports

## Svelte 5

- Use runes API exclusively: `$props()`, `$state()`, `$derived()`, `$effect()`
- Do NOT use legacy Svelte 4 syntax (`export let`, `$:` reactive statements, `<slot>`)
- Type props inline in the destructuring:
  ```svelte
  let { title, count = 0 }: { title: string; count?: number } = $props();
  ```
- Use `Snippet` type from `svelte` for children/slot content:
  ```svelte
  import type { Snippet } from 'svelte';
  let { children }: { children?: Snippet } = $props();
  ```
- Render snippets with `{@render children()}`
- Scoped `<style>` blocks per component; no CSS frameworks or utility classes

## SvelteKit Patterns

- **Load functions**: Export `load` from `+page.server.ts` (or `+layout.server.ts`). Return plain objects.
- **Form actions**: Export `actions` from `+page.server.ts`. Use `request.formData()` to parse input. Return `fail(statusCode, data)` for validation errors.
- **API routes**: `+server.ts` files in `src/routes/api/`. Use `json()` helper for responses.
- **Error handling**: Use SvelteKit's `fail()` for expected errors in actions. Throw or re-throw for unexpected errors.
- **Imports**: Use `$lib/` for library code, `$app/` for SvelteKit builtins.
- **Context**: Use `setContext`/`getContext` for shared state (e.g., the WebSocket client is set in root layout and consumed by pages).

## Service Layer

- Services are singleton objects exported as `const gameService = { ... }` from `src/lib/server/services/`
- Each service method is an `async` function that interacts with the database via Drizzle
- Use `db.transaction()` for operations that need atomicity
- Services throw plain `Error` instances with descriptive messages (e.g., `'Conflict: game was modified by another user'`)
- Validation lives in `src/lib/server/validation.ts`, separate from services
- Services broadcast WebSocket events after successful mutations (via `broadcastGameEvent()`, `broadcastTransactionEvent()`, etc.)

## Validation

- Server-side validation functions return `ValidationResult<T>` with `{ valid, errors, data? }`
- `errors` is `Record<string, string>` keyed by field name
- Valid results include a cleaned/trimmed `data` object
- Client-side validation helpers live in `src/lib/utils/validation.ts`

## Database (Drizzle ORM)

- Schema defined in `src/lib/server/db/schema.ts` using `pgTable()`
- Use Drizzle query builder (not raw SQL) for all queries
- Indexes defined inline in table definitions
- Migrations generated with `npm run db:generate`, applied with `npm run db:migrate`
- Migrations auto-run on server startup via `hooks.server.ts`

## WebSocket

- Server-side modules live in `src/lib/server/ws/`
- Client-side store in `src/lib/stores/websocket.svelte.ts` uses Svelte 5 runes (`$state()` for `connected`)
- Event types are defined in `src/lib/server/ws/events.ts` and shared between server and client
- Broadcast helpers in `src/lib/server/ws/broadcast.ts` provide typed convenience functions
- The connection manager is a singleton class tracking active WebSocket connections
- Production uses a standalone `server.js` that creates the WSS before importing the SvelteKit build
- Development uses a Vite plugin that attaches to the dev server's HTTP upgrade event (filtering by `/ws` path to avoid breaking Vite HMR)

## Components

- Reusable components live in `src/lib/components/`
- Components use PascalCase filenames: `GameCard.svelte`, `FilterPanel.svelte`
- Keep components focused — one responsibility per component
- Use semantic HTML and ARIA attributes for accessibility
- Style with scoped CSS; use the project's indigo accent color (`#6366f1`) for interactive elements
- Dialog components (`CheckoutDialog`, `CheckinDialog`, `ConfirmDialog`) use the native `<dialog>` element pattern

## Error Handling

- Optimistic locking conflicts return `fail(409, { conflict: true, message })` from form actions
- Validation errors return `fail(400, { errors, values })` — `values` preserves form state for re-rendering
- Success returns `{ success: true }` from form actions
- Database errors are classified via `db-errors.ts` into user-friendly messages
- WebSocket conflict detection shows inline warnings when another user modifies the same game
