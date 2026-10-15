# Final report: SvelteKit 3 + package upgrades

Status: implemented, verified, and APPROVED by review. Every dependency is on its latest version except TypeScript, which is held at 6.x on purpose. All changes are uncommitted in the working tree on `master` (HEAD `690e441`). `git diff --stat`: 64 files changed, 1233 insertions, 2067 deletions (mostly `package-lock.json`). Plus one new untracked file, `src/env.ts`.

Sources: `.agents/tasks/sveltekit-3-upgrade/{plan.md, verification.md, review.md, review.json, upgrade-baseline.md}`, `package.json`, and `git diff`.

## 1. Package version changes

Ranges are the declared `package.json` values, HEAD → working tree. Installed versions come from `npm ls` in verification.md.

| Package | Old | New | Kind |
|---|---|---|---|
| @sveltejs/kit | ^2.62.0 (installed 2.70.3) | ^3.1.0 (3.1.0) | major |
| @sveltejs/adapter-node | ^5.5.4 (installed 5.5.7) | ^6.0.0 (6.0.0) | major |
| vitest | ^4.1.8 (installed 4.1.11) | ^5.0.4 (5.0.4) | major |
| typescript | ^6.0.3 | ^6.0.3 (unchanged; 7.0.2 available) | major held back |
| @playwright/test | ^1.60.0 | ^1.64.1 | minor |
| @sveltejs/vite-plugin-svelte | ^7.1.2 | ^7.3.1 | minor |
| @types/pg | ^8.11.0 | ^8.23.1 | minor |
| @types/ws | ^8.5.0 | ^8.18.2 | minor |
| drizzle-kit | ^0.31.10 | ^0.31.11 | patch |
| svelte | ^5.56.1 | ^5.57.2 | minor |
| svelte-check | ^4.5.0 | ^4.7.6 | minor |
| vite | ^8.0.16 | ^8.3.4 | minor |
| drizzle-orm | ^0.45.2 | ^0.45.4 | patch |
| fast-check | ^4.8.0 | ^4.10.2 | minor |
| papaparse | ^5.5.3 | ^5.7.0 | minor |
| pg | ^8.21.0 | ^8.23.1 | minor |
| svelte-hot-french-toast | ^4.0.0 | ^4.1.0 | minor |
| ws | ^8.21.0 | ^8.22.0 | minor |
| bcryptjs, @types/bcryptjs, @types/papaparse | — | unchanged | — |

`package.json` also gained an `imports` field (`#lib` and `#lib/*` → `./src/lib/*`). The final `npm outdated` lists only `typescript 6.0.3 → 7.0.2`.

Minor/patch changelog check (verification.md):
- drizzle-orm, drizzle-kit: patch releases. The DB-backed E2E tests pass.
- pg 8.22 and 8.23: additive only (`sslnegotiation=direct`, query pipelining).
- ws 8.22: minor. The realtime property and E2E tests pass.
- papaparse 5.6 dropped its jQuery dependency and 5.7 added a `downloadTimeout` option. Parse/unparse defaults did not change. The CSV property and E2E tests pass.
- svelte-hot-french-toast 4.1: minor. The toast assertions pass.
- @playwright/test 1.64: needs a newer Chromium headless-shell build (installed locally with `npx playwright install chromium`). No test changes.

## 2. What `sv migrate sveltekit-3` did vs. hand work

Codemod: `npx sv migrate sveltekit-3 --tasks all --confirm --no-git-check --install npm`, sv v1.1.1. It did:
- bumped kit to ^3.0.0 and adapter-node to ^6.0.0, regenerated the lockfile, and added the package.json `imports` (`#lib`)
- changed `$lib` → `#lib` with explicit `.js` extensions across src/ and tests/properties (including `vi.mock` paths)
- changed `$app/stores` → `$app/state` (`$page` → `page`) in 5 files
- changed `$env/dynamic/private` → `$app/env/private` in the two test API routes and created `src/env.ts` with `defineEnvVars`
- moved svelte.config.js (adapter, preprocess, csrf) into `sveltekit({...})` in vite.config.ts and deleted svelte.config.js
- made `tsconfig.json` extend `$app/tsconfig`
- generated `MIGRATION_TASKS.md`

After the codemod, `npm run check` reported 5 `keepFocus` errors.

Finished by hand:
1. Reverted the codemod's formatting churn in 6 files (config, games, games/[id] and backup `+page.svelte`, api/test-helpers and api/test-reset `+server.ts`). Only the semantic edits were kept.
2. Bumped kit to ^3.1.0 and vitest to ^5.0.4. Added `.vitest/` to .gitignore.
3. Changed `invalidateAll` → `refreshAll` in src and in the test mocks and comments. The `createInvalidateDebouncer` name was kept.
4. Renamed `goto` options in library, attendees, games, statistics and transactions.
5. Changed `json()` → `Response.json()` in api/attendees/search and api/games/available.
6. Cleaned up `src/env.ts`: removed the `@migration-task` comment and added a description.
7. Fixed server.js for adapter-node 6.
8. Replaced `ORIGIN` with proxy headers in docker-compose.
9. Added an explicit `exclude` to tsconfig.
10. Reviewed Kit 3 behaviour changes (section 4).
11. Updated the steering docs and README.
12. Deleted `MIGRATION_TASKS.md` after every task in it was handled.

## 3. Breaking changes that applied, and how they were handled

| Change | Handling |
|---|---|
| `$lib` alias replaced by `#lib` subpath imports | Codemod; ESM extensions added |
| `$app/stores` removed | Codemod → `$app/state` / `page` |
| `$env/*` modules removed | Codemod → `$app/env/private` + `src/env.ts`; `ALLOW_TEST_RESET` schema returns `''` when unset, so the `!== 'true'` guard is unchanged |
| svelte.config.js removed | Codemod moved its config into `sveltekit({...})` in vite.config.ts |
| tsconfig must extend `$app/tsconfig` | Codemod; explicit `exclude` added by hand |
| `invalidateAll` → `refreshAll` | Hand: src + test mocks (`mockRefreshAll`) |
| `goto` options renamed | `{ replaceState, keepFocus }` → `{ replace: true, reset: false }`; `{ replaceState }` → `{ replace: true }` |
| `json()`/`text()` helpers deprecated | `Response.json()` with the same status codes. api/test-helpers has its own local `json()` helper and was left alone |
| adapter-node 6 drops Polka; `build/index.js` exports the `node:http` Server as `server` | server.js now does `const { server: httpServer } = await import('./build/index.js')`. Before this fix, `server.server` was `undefined` and the `upgrade` listener would have thrown at startup. The `sveltekit:shutdown` listener is kept (the event still exists) |
| adapter-node 6 removed `ORIGIN` | See section 6 |
| Vitest 5 (`clearMocks` defaults to true, `vi.mock` must be top-level) | No changes needed. The mocks were already top-level and the tests don't rely on call history carrying over between tests |

User-visible nuance: `reset: false` keeps the scroll position as well as focus when filters change. Before, only focus was kept. This is the documented 1:1 replacement, and review accepted it as intended.

## 4. Breaking changes checked and found not to apply

- Cookie v2's default `path` change: every `cookies.set` and `cookies.delete` already passes `path: '/'`, and the cookie name is ASCII.
- `use:enhance` now navigates to the action page in cross-page actions: the only cross-page form (`/management?/login`) uses a custom callback that never calls `update()`, so users stay on the sub-page. The password-protection E2E test passes.
- `fail()` statuses now reach the client: the callbacks branch on `result.type`, not on status.
- `handle`/`handleError`/`resolve` changes: hooks.server.ts has no `handle` or `handleError`. `error()` calls use string messages, `redirect()` targets are internal, and there are no 204 responses.
- `goto` now rejects unresolved URLs: all 20 calls target a copy of the current URL or an internal route.
- `page.url` is readonly: it is only ever read. Mutations use `new URL(window.location.href)` copies.
- `page.state` with `refreshAll`: shallow routing is not used.
- `data-sveltekit-*="off"`: not used. `preload-data="hover"` is still valid.
- Removed config options (`files.lib`, `preloadStrategy`, `csrf.checkOrigin`, `prerender.origin`, `vitePlugin`): none were used.
- Server-only import guard: every client import from `#lib/server/**` is `import type`, which `verbatimModuleSyntax` erases. The build succeeds, so `events.ts` was not moved.
- `@sveltejs/kit/node/polyfills`: not imported anywhere.
- adapter-node static assets now served from a build-time list (GET/HEAD only): nothing writes into `build/` at runtime.
- Dockerfile: `#lib` is resolved at bundle time, so no `#lib` remains in `build/server`. The image built and ran unchanged.
- Links to the current page now `refreshAll` (Navbar): harmless. The responsive-nav and realtime E2E tests pass.

## 5. Packages held back

TypeScript stays on ^6.0.3 instead of 7.0.2:
- @sveltejs/kit 3.1.0 peers on `typescript ^6.0.0`.
- svelte-check 4.7.6, the latest release, peers on `^5 || ^6`.
- typescript 7 is the native Go port. It no longer exports the JS compiler/language-service API that svelte-check, svelte2tsx and Kit's sync tooling depend on, so it would break `npm run check`.

Revisit once svelte-check ships TS 7 support. Nothing else was held back.

## 6. ORIGIN / `paths.origin` decision; CSRF and auth equivalence

- adapter-node 6 removed `ORIGIN`. `paths.origin` is baked in at build time. Production runs behind Caddy on a LAN whose hostname isn't known at build time, so `paths.origin` was not used.
- Instead, both docker-compose.yml and docker-compose.test.yml set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` on `app`. The ignored `ORIGIN=http://localhost:8080` line was removed from the test compose file. Nothing reads `process.env.ORIGIN`.
- Header trust: Caddy sets and overwrites these headers. The app port is only `expose`d, never published, so the headers can't be spoofed by bypassing Caddy. This constraint is documented in the compose comments and in build-and-run.md. Publishing port 3000 later would break it.
- Side effect: without `PROTOCOL_HEADER`, adapter-node assumes `https`. Request URLs now correctly resolve to `http://<host>`, where before production used an implicit `https://`. Nothing in src uses `url.origin` for security decisions.
- CSRF/auth equivalence: `csrf.trustedOrigins: ['*']` was carried over unchanged from svelte.config.js, so the CSRF posture is neither weakened nor tightened. Session cookies keep `path: '/'`, `httpOnly`, `sameSite: 'lax'` and `secure: false`. The bcrypt and HMAC session logic is untouched. The login, config and form-action E2E tests pass.

## 7. Steering files updated (`.kiro/steering/`)

- `coding-conventions.md`: covers `#lib/*` imports with explicit extensions, `Response.json()`, `refreshAll()`, `$app/state`, the `goto` `replace`/`reset`/`refreshAll` options, `src/env.ts` + `defineEnvVars` + `$app/env/*` (with `DATABASE_URL`/`AUTH_SECRET` staying on `process.env`), config in vite.config.ts, and tsconfig extending `$app/tsconfig` with TS held at 6.x.
- `project-overview.md`: SvelteKit 3, `src/env.ts` and the vite.config.ts note in the tree (no svelte.config.js), and the debounced `refreshAll()`.
- `testing.md`: the `refreshAll` mock snippet, the `#lib` import in the structure pattern, alias resolution (`#lib` via package.json `imports`, `$app/*` via the Kit plugin), and Vitest 5 `clearMocks` defaulting to true.
- `build-and-run.md`: adapter-node 6 exports the `node:http` Server directly (Polka gone; the WebSocket table row is fixed), `PROTOCOL_HEADER`/`HOST_HEADER` replace `ORIGIN` along with the not-published-port caveat, a Project Configuration section, and the TS 6 hold.

README.md was also updated (SvelteKit 2 → 3).

## 8. Verification results (from verification.md, not re-run)

| Check | Result |
|---|---|
| `npm install` / `npm ls --depth=0` | Clean, no peer or ERESOLVE warnings |
| `npm run check` | 0 errors, 0 warnings (5 errors right after the codemod) |
| `npm run test` (Vitest 5.0.4) | 19 files / 262 tests passed (baseline 262), no deprecation output |
| `npm run build` | Succeeds (ssr + client + adapter-node) |
| server.js check | Checked against the build output: `build/index.js` exports `httpServer as server` and `sveltekit:shutdown` is still emitted. Production `/ws` upgrades were exercised by the realtime-* E2E tests against the Docker image, and all passed |
| `npm run test:e2e` (Docker available) | 197 passed, 1 skipped, 0 failed (198 tests, 28 files). The skip is the existing `test.skip` pg_dump round-trip in backup-restore.test.ts. Teardown ran and no containers were left behind |
| Dev-mode smoke test | Throwaway postgres:17-alpine + Vite dev server: migrations and seed ran, `GET /library` returned 200, `/ws` opened |

The first E2E run failed at browser launch because the Chromium build for Playwright 1.64 was missing. It was fixed with `npx playwright install chromium` (environment only) and the suite was rerun.

## 9. Open items (non-blocking, from review)

- The bare `"#lib": "./src/lib/index.js"` mapping in package.json points at a file that doesn't exist. Nothing imports bare `#lib`, so it can be removed if you like.
- The name `createInvalidateDebouncer` is stale now that it wraps `refreshAll`. Renaming it is optional.
- The dev-mode Vite WebSocket plugin has only the manual smoke test above, no automated coverage.
- Tightening `csrf.trustedOrigins` (currently `['*']`) was out of scope. It could be a follow-up.
- Nothing is committed yet. The changes are in the working tree for you to review and commit.

Summary: the final report is at `.agents/tasks/sveltekit-3-upgrade-report.md`.
