# Testing Guide

## Overview

The project uses two testing layers:

1. **Property-based tests** (Vitest + fast-check) — validate domain logic invariants
2. **E2E integration tests** (Playwright) — validate full user flows through the running app in Docker

## Running Tests

```bash
npm run test          # Property-based + unit tests (Vitest, single run)
npm run test:e2e      # E2E tests (builds Docker, runs Playwright, tears down)
```

Do NOT use watch mode in automated contexts. Vitest is configured with `vitest run` via the `test` script.

## Property-Based Tests (fast-check)

Location: `tests/properties/*.prop.test.ts`

### Current Test Files (12)

| File | Domain |
|------|--------|
| `auth.prop.test.ts` | Session cookie HMAC, rate limiting delays |
| `config-validation.prop.test.ts` | Convention config validation rules |
| `csv.prop.test.ts` | CSV parsing and validation invariants |
| `game-deletion.prop.test.ts` | Soft-delete / retire logic |
| `game-validation.prop.test.ts` | Game creation/update validation |
| `library.prop.test.ts` | Library query filtering and pagination |
| `library-websocket.prop.test.ts` | WebSocket conflict detection in library context |
| `pagination.prop.test.ts` | Pagination math (offsets, page counts) |
| `time-distribution.prop.test.ts` | Statistics time granularity selection |
| `transaction-validation.prop.test.ts` | Checkout/checkin validation rules |
| `websocket.prop.test.ts` | Connection manager, broadcast, reconnection, event routing |
| `weight-warning.prop.test.ts` | Weight discrepancy threshold logic |

### Conventions

- File naming: `{domain}.prop.test.ts` (e.g., `game-validation.prop.test.ts`)
- Each file tests one or more formal correctness properties
- Each property has a JSDoc comment explaining what it validates and which requirements it covers
- Use `fc.assert(fc.property(...))` pattern
- Define custom arbitraries for domain types (valid titles, valid BGG IDs, etc.)
- Test both the rejection path (invalid inputs → validation fails) and the acceptance path (valid inputs → validation succeeds with correct data)
- Default `numRuns` is fine for most properties; increase to 1000 for simple/fast properties
- Mock `$app/navigation` when importing modules that depend on SvelteKit runtime:
  ```typescript
  vi.mock('$app/navigation', () => ({
    invalidateAll: vi.fn(() => Promise.resolve())
  }));
  ```

### Structure Pattern

```typescript
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateSomething } from '$lib/server/validation.js';

describe('Property N: Description of the invariant', () => {
  // Define arbitraries
  const validInput = fc.record({ ... });
  const invalidInput = fc.record({ ... });

  it('rejects invalid inputs', () => {
    fc.assert(
      fc.property(invalidInput, (input) => {
        const result = validateSomething(input);
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveProperty('fieldName');
      })
    );
  });

  it('accepts valid inputs', () => {
    fc.assert(
      fc.property(validInput, (input) => {
        const result = validateSomething(input);
        expect(result.valid).toBe(true);
        expect(result.data).toBeDefined();
      })
    );
  });
});
```

### Vitest Config

Test file patterns (from `vite.config.ts`):
- `src/**/*.{test,spec}.{js,ts}`
- `tests/**/*.{test,spec}.{js,ts}`
- `tests/**/*.prop.test.{js,ts}`

Path aliases (`$lib`, etc.) work in test files via the SvelteKit Vite plugin.

## E2E Integration Tests (Playwright)

Location: `tests/integration/*.test.ts`

### Current Test Files (24)

| File | Coverage Area |
|------|---------------|
| `backup-restore.test.ts` | Database export/import flows |
| `bad-inputs.test.ts` | Validation error handling in UI |
| `catalog.test.ts` | Game browsing and filtering |
| `checkout-checkin.test.ts` | Core checkout/checkin user flows |
| `configuration.test.ts` | Convention settings management |
| `csv-import-export.test.ts` | CSV upload and download |
| `edit-game.test.ts` | Game editing with optimistic locking |
| `game-deletion.test.ts` | Retire/restore game flows |
| `game-types.test.ts` | Standard, play-and-win, play-and-take behavior |
| `landing-page.test.ts` | Home page rendering |
| `management.test.ts` | Admin dashboard and navigation |
| `password-protection.test.ts` | Login flow and session management |
| `realtime-checkin.test.ts` | Live updates during checkin |
| `realtime-checkout.test.ts` | Live updates during checkout |
| `realtime-conflict.test.ts` | Conflict detection via WebSocket |
| `realtime-form-preservation.test.ts` | Form state preserved during live updates |
| `realtime-indicator.test.ts` | Connection indicator behavior |
| `realtime-management.test.ts` | Live updates on management pages |
| `realtime-static.test.ts` | Static pages ignore non-resync events |
| `responsive-nav.test.ts` | Mobile navigation behavior |
| `retired-visibility.test.ts` | Retired games hidden from public views |
| `statistics.test.ts` | Statistics dashboard metrics and filtering |
| `transactions.test.ts` | Transaction log display and filtering |

### Setup

E2E tests run against a Dockerized instance of the full app (app + PostgreSQL). The test lifecycle:

1. `npm run test:e2e:setup` — builds and starts Docker containers
2. Playwright tests run against `http://localhost:8080`
3. `npm run test:e2e:teardown` — stops containers and removes volumes

### Test Fixtures

Tests use a custom fixture defined in `tests/integration/fixtures.ts`:

```typescript
import { test, expect } from './fixtures';
```

The fixture provides a `helpers` object with:
- `helpers.prefix` — unique string per test to avoid data collisions
- `helpers.createGame(title, opts?)` — creates a game via the test API, auto-cleaned after test
- `helpers.checkoutGame(gameName, firstName, lastName, weight)` — performs checkout through the UI
- `helpers.checkinGame(gameName, weight)` — performs checkin through the UI

### Conventions

- Always use `helpers.prefix` in game titles to isolate test data
- Use `helpers.createGame()` instead of manual UI creation for setup
- Locate elements with accessible selectors: `getByRole()`, `getByText()`, ARIA labels
- Use `.locator('.game-card', { hasText: title })` pattern for game cards
- Assert toast messages for success/error feedback
- Clean up is automatic via the fixture's teardown
- For real-time tests, use two browser contexts to simulate multiple users
- Use `page.waitForResponse()` or `expect(...).toBeVisible()` for async assertions after WebSocket events

### Test API Endpoints (test-only)

- `POST /api/test-helpers` — create games, delete games (used by fixtures)
- `POST /api/test-reset` — reset test state

These endpoints exist only for test support and should not be used in production code.
