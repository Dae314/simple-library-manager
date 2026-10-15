# Implementation Plan: SvelteKit 3 + major package upgrades

Repo: `c:\Users\casey\Documents\Web Programming\simple-library-manager` (Windows, PowerShell, Node v24.21.0; Docker uses node:24-alpine).
Work directly in this checkout. No worktree, no commits, no pushes. Keep every existing uncommitted change (the `npm update --save` + codemod output).

Commands (from package.json / steering):
- Typecheck: `npm run check` (svelte-kit sync + svelte-check)
- Unit/property: `npm run test` (vitest run; 19 files / 262 tests at baseline)
- Build: `npm run build` (output `build/`)
- E2E: `npm run test:e2e` (docker-compose.test.yml → Playwright on http://localhost:8080 → teardown). Docker 29.8.2 is available.

## 0. What the codemod already did (`npx sv migrate sveltekit-3 --tasks all --confirm --no-git-check --install npm`, sv v1.1.1)

Run during planning. It ran all 12 tasks and `npm install`. Installed now: @sveltejs/kit 3.1.0, @sveltejs/adapter-node 6.0.0, typescript 6.0.3, vitest 4.1.11, vite 8.3.4, svelte 5.57.2, svelte-check 4.7.6, vite-plugin-svelte 7.3.1.

Changed by the codemod:
- `package.json`: `@sveltejs/kit` → `^3.0.0`, `@sveltejs/adapter-node` → `^6.0.0`; added `"imports": { "#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*" }`. `package-lock.json` regenerated.
- `svelte.config.js` deleted. `vite.config.ts` now calls `sveltekit({ preprocess: vitePreprocess(), adapter: adapter({ out: 'build' }), csrf: { trustedOrigins: ['*'] } })`.
- `tsconfig.json`: now `"extends": "$app/tsconfig"`. Redundant compilerOptions dropped (they're in `node_modules/$app/tsconfig.json`). Only `sourceMap` and `strict` kept. `include` is now `["src","vite.config.ts","drizzle.config.ts","playwright.config.ts","tests"]`. There is no `exclude`.
- `$lib` → `#lib` with explicit `.js` extensions, in every file under src/ and tests/properties. This includes `vi.mock('#lib/server/db/index.js')` in game-deletion.prop.test.ts. The two extensionless imports got `.js` added (`+layout.server.ts`, `WeightWarning.svelte`).
- `$app/stores` → `$app/state` (`$page` → `page`) in `+layout.svelte`, `management/backup`, `management/config`, `management/games`, and `management/games/[id]` `+page.svelte`.
- `$env/dynamic/private` → `import { ALLOW_TEST_RESET } from '$app/env/private'` in `api/test-helpers/+server.ts` and `api/test-reset/+server.ts`. Created `src/env.ts` with `defineEnvVars({ ALLOW_TEST_RESET: { schema: (input) => input ?? '' } })` and one `// @migration-task` comment.
- Generated `MIGRATION_TASKS.md` at the repo root (untracked).
- Side effect: the svelte/TS reprinter reformatted code it didn't need to touch. Examples: `&larr;` → `←`, collapsed `$derived(...)` blocks, `{columns}` → `columns={columns}`, dropped parentheses in spreads/arrow bodies, reflowed `<h1>`/`<button>` markup, and the 404 `new Response(...)` blocks put on one line. This affects `management/config/+page.svelte`, `management/games/+page.svelte`, `management/games/[id]/+page.svelte`, `management/backup/+page.svelte`, `api/test-helpers/+server.ts`, and `api/test-reset/+server.ts`.

Left for hand work (confirmed after the codemod):
- `npm run check` gives **5 errors**: `keepFocus` doesn't exist in `GotoOptions`. They're in library, management/attendees, games, statistics, and transactions `+page.svelte`.
- `npm run test` passes 262/262 and `npm run build` succeeds (client + ssr; no `#lib` left in `build/server`). `build/adapter-node.js` has `export const origin = undefined`.
- Still not migrated: `invalidateAll` (src + test mocks), `json()` (2 API routes), the `goto` `replaceState` option, `server.js` (broken against adapter-node 6, see item 8), `ORIGIN` in docker-compose.test.yml, the env.ts `@migration-task`, Vitest 5, and steering docs.

## Decisions

- **D1 TypeScript 7: stay on `^6.0.3`.** @sveltejs/kit 3.1.0 has peer `typescript: ^6.0.0`. svelte-check 4.7.6 (the latest) has peer `^5.0.0 || ^6.0.0`. typescript@7.0.2 (the native Go port) no longer exposes the JS compiler/language-service API: its `exports` are only `./lib/version.cjs` plus `./unstable/*`. svelte-check/svelte2tsx and Kit's sync tooling depend on that API. Kit itself only uses TS 7 internally as `@typescript/native` for its own repo checks. Forcing 7 would break `npm run check`. Revisit when svelte-check publishes TS 7 support.
- **D2 adapter-node 6 origin: derive it from proxy headers, don't use `paths.origin`.** Prod runs behind Caddy on port 80 for LAN access, so the hostname/IP isn't known at build time and `paths.origin` (baked in at build) can't be used.
  - Set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` on the `app` service in both `docker-compose.yml` and `docker-compose.test.yml`. Caddy's `reverse_proxy` sets both by default and overwrites client-supplied values.
  - The `app` service is only `expose`d (never published), so the headers can't be spoofed by bypassing Caddy.
  - Without `PROTOCOL_HEADER`, adapter-node defaults the protocol to `https` (see `node_modules/@sveltejs/adapter-node/src/handler.js` `get_origin`). Every request URL would then be `https://…` while the browser sends `Origin: http://…`.
  - Remove the now-ignored `ORIGIN=http://localhost:8080` line from docker-compose.test.yml. Nothing else reads `ORIGIN` (no `process.env.ORIGIN` anywhere).
  - Keep `csrf: { trustedOrigins: ['*'] }` unchanged. That's the existing CSRF posture, so auth/CSRF stays equivalent: not weakened and not tightened. Tightening is a possible follow-up, out of scope.
  - Session cookies already pass explicit `path: '/'`, `httpOnly`, `sameSite: 'lax'`, `secure: false`, so the derived protocol doesn't change cookie behaviour.
- **D3 Vitest: upgrade to `^5.0.4`.** Peer vite `^6.4 || ^7 || ^8` is fine with 8.3.4. Engines `^22.12 || ^24` is fine with Node 24.
- **D4 `goto` options:** `{ replaceState: true, keepFocus: true }` → `{ replace: true, reset: false }`, and `{ replaceState: true }` → `{ replace: true }`. Note the user-visible nuance: `reset: false` also keeps the scroll position on filter changes, where before only focus was kept. That's the documented 1:1 replacement and keeps search inputs focused while typing. Accept it and mention it in the final report.
- **D5 Revert codemod formatting churn.** Keep the diff reviewable and avoid unintended markup changes. In the six reprinted files, keep only the semantic edits. Those files had no uncommitted changes before the codemod, so `git show HEAD:<file>` is a safe source.
- **D6 `src/env.ts`: keep `ALLOW_TEST_RESET` dynamic and private,** with a schema that returns `''` when unset. This matches the old `env.ALLOW_TEST_RESET !== 'true'` behaviour exactly. `DATABASE_URL`/`AUTH_SECRET` stay on `process.env`, because drizzle.config.ts, scripts/reset-password.js and `backup.ts` (which spawns `pg_dump` with `process.env`) also need them outside Kit.
- **D7 No server-only split needed (verify during build).** Every client-side import from `#lib/server/**` is `import type`: CheckinDialog, CheckoutDialog, SwapDialog, `websocket.svelte.ts`, `library/+page.svelte`, `games/[id]/+page.svelte`, `statistics/+page.svelte`. These are erased under `verbatimModuleSyntax` (from `$app/tsconfig`). `src/lib/server` was already server-only in Kit 2, and it's the only `server` dir outside src/routes. `npm run build` already succeeds. Only move `events.ts` types if a later build fails with a server-only import error.
- **Workflow shape:** one coherent, tightly coupled upgrade (everything must typecheck/build together), so no FEAT decomposition. The existing build-loop implements this plan.

## Items

- [ ] 1. Revert codemod formatting churn (D5).
      For each file, restore from HEAD with `git show "HEAD:<path>" > <path>` (or `git checkout HEAD -- <path>`), then re-apply only:
      - `$lib/` → `#lib/` with `.js` extensions
      - `$app/stores` → `$app/state` with `$page` → `page`
      - for the API routes: the `$env/dynamic/private` → `$app/env/private` import and `env.ALLOW_TEST_RESET` → `ALLOW_TEST_RESET`

      Keep the original multi-line `new Response(JSON.stringify(...), { status: 404, headers })` layout, `&larr;`, markup and parentheses.
      Files: src/routes/management/config/+page.svelte, src/routes/management/games/+page.svelte, src/routes/management/games/[id]/+page.svelte, src/routes/management/backup/+page.svelte, src/routes/api/test-helpers/+server.ts, src/routes/api/test-reset/+server.ts. Check src/routes/+layout.svelte and statistics/+page.svelte too (diffs there look semantic-only; leave them if so).
      Verify: `git diff --ignore-all-space -- <those files>` shows only import/`page`/env lines. `npm run check` shows only the 5 known `keepFocus` errors. `npm run test` passes 262/262.

- [ ] 2. Package versions. Set `"@sveltejs/kit": "^3.1.0"`, keep `"@sveltejs/adapter-node": "^6.0.0"`, keep `"typescript": "^6.0.3"` (D1), and upgrade Vitest: `npm install -D vitest@^5.0.4`. Confirm `npm ls vitest vite typescript @sveltejs/kit @sveltejs/adapter-node` shows no invalid/unmet peers. Add `.vitest/` to `.gitignore` (Vitest 5 artifact root).
      Files: package.json, package-lock.json, .gitignore
      Verify: `npm ls --depth=0` is clean. `npm run test` (now "RUN v5.0.4") passes 262/262.

- [ ] 3. Vitest 5 compatibility review (depends on 2). Go through the vitest.dev/guide/migration items against tests/properties:
      - `clearMocks` now defaults to true. game-deletion already calls `vi.clearAllMocks()` in `beforeEach`. websocket.prop.test.ts checks `ws.send` call counts inside tests, and Property 7 calls `mockClear()`.
      - `vi.mock` must be at the top level. It already is in game-deletion, websocket and library-websocket.
      - Unawaited `.rejects`: game-deletion lines 186/252 are awaited.
      - No `toThrow('')`, `test.sequential`, `bench`, or `VITEST_*_ID` usage.
      - `vi.useFakeTimers` in auth.prop.test.ts: Temporal faking doesn't matter there.

      `vite.config.ts` keeps `defineConfig` from `vitest/config`. Only change config/tests if a run fails.
      Files: vite.config.ts, tests/properties/* (only if needed)
      Verify: `npm run test` passes 262/262 with no deprecation warnings in the output.

- [ ] 4. `invalidateAll` → `refreshAll` everywhere. `page.state`/shallow routing isn't used anywhere, so `refreshAll` keeping `page.state` has no impact.
      - Imports and calls: src/lib/stores/websocket.svelte.ts (import, debouncer call, reconnect call + its warn message), src/lib/components/SwapDialog.svelte, src/routes/library/+page.svelte (top import, the effect call, and two dynamic `const { invalidateAll } = await import('$app/navigation')` blocks), src/routes/management/+layout.svelte, src/routes/management/games/+page.svelte, src/routes/management/games/[id]/+page.svelte, src/routes/management/transactions/+page.svelte.
      - Update comments that say invalidateAll. Rename `createInvalidateDebouncer` only if that's trivial and no test imports it; otherwise keep the name.
      - Tests: the `vi.mock('$app/navigation', () => ({ refreshAll: vi.fn(() => Promise.resolve()) }))` mocks in tests/properties/websocket.prop.test.ts and library-websocket.prop.test.ts, plus the `const { refreshAll: mockRefreshAll } = await import('$app/navigation')` destructure and test titles/JSDoc in websocket.prop.test.ts (Property 7).
      Verify: `npm run check` (only `keepFocus` errors remain, if item 5 isn't done yet) and `npm run test` passes 262/262. Searching src/ and tests/ for `invalidateAll` finds no code references.

- [ ] 5. `goto` option renames (D4) and destination review.
      - library/+page.svelte lines ~211/229/237/248
      - management/attendees/+page.svelte ~86/104/112/123
      - management/games/+page.svelte ~81/191/213/221/232
      - management/statistics/+page.svelte ~89/111/118
      - management/transactions/+page.svelte ~138/156/164/175

      `{ replaceState: true, keepFocus: true }` → `{ replace: true, reset: false }`; `{ replaceState: true }` → `{ replace: true }`. Keep the `goto('/management/attendees/${id}')` and `goto('/management/games/${id}')` calls as they are; they're internal routes.
      `goto` now rejects for URLs that don't resolve to a route. Every destination is the current page's own URL (`new URL(window.location.href)` copy) or an internal route, so no `window.location` fallback is needed. Verify during E2E.
      `page.url` readonly: the only `page.url` uses are reads (`Navbar.svelte`, `+layout.svelte`, games `onMount` `searchParams.get` + `pathname`). Every mutable URL is already a `new URL(window.location.href)` copy, so no change. svelte-check confirms it.
      Files: the 5 page files above
      Verify: `npm run check` shows 0 errors and 0 warnings.

- [ ] 6. `json()` → `Response.json()` in src/routes/api/attendees/search/+server.ts and src/routes/api/games/available/+server.ts. Remove the `import { json } from '@sveltejs/kit'`. Keep the status codes (`{ status: 400 }`, `{ status: 500 }`). `management/games/+page.server.ts` was a false positive in MIGRATION_TASKS.md: its matches are `file.text()`, which is unrelated.
      Verify: `npm run check` 0/0. `npm run build` succeeds. E2E attendee-autofill and swap tests (they call these endpoints) pass in item 12.

- [ ] 7. `src/env.ts` (D6). Remove the `@migration-task` comment. Add `description: 'Set to "true" to enable the test-only /api/test-helpers and /api/test-reset endpoints'`. Keep `schema: (input) => input ?? ''`. Make sure the two test API routes still compare `ALLOW_TEST_RESET !== 'true'`.
      Files: src/env.ts
      Verify: `npm run check` 0/0. `npm run build` succeeds without ALLOW_TEST_RESET set. In item 12 the E2E global setup (which calls /api/test-reset) works with `ALLOW_TEST_RESET=true` set at runtime only.

- [ ] 8. adapter-node 6 + `server.js`. adapter-node 6 no longer uses Polka: `build/index.js` re-exports `server`, which is the `node:http` `Server` itself (`node_modules/@sveltejs/adapter-node/src/index.js`: `export { httpServer as server }`). So `server.server` is now `undefined`, and `httpServer.on('upgrade', …)` would throw at startup.
      - Change to `const { server: httpServer } = await import('./build/index.js');` and update the comments (no Polka).
      - `process.emit('sveltekit:shutdown', reason)` still exists in adapter-node 6, so keep the shutdown listener.
      - There are no `@sveltejs/kit/node/polyfills` imports anywhere; nothing to remove.
      - Static assets now come from a build-time list and only for GET/HEAD. Nothing writes into `build/` at runtime (backup/CSV are streamed via routes), so no change.
      - Dockerfile: `#lib` is resolved at bundle time (no `#lib` in `build/server`). Production deps stay external, per adapter-node 6's `ssr.external = Object.keys(pkg.dependencies)`. So the prod image needs nothing new beyond `package*.json` + `npm ci --omit=dev`. Keep the Dockerfile unchanged unless the image fails in item 12.
      Files: server.js
      Verify: `npm run build`, then a local prod smoke test: `$env:DATABASE_URL='postgresql://invalid'; node server.js` is expected to fail at the DB migrate in hooks, which proves the import works. Better: rely on the full E2E in item 12, where the app container healthcheck and the realtime-* tests exercise the `/ws` upgrade.

- [ ] 9. Origin config for adapter-node 6 (D2). In docker-compose.yml `app.environment`, add `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`. In docker-compose.test.yml `app.environment`, add the same two and remove `ORIGIN=http://localhost:8080`. Leave Caddyfile and Caddyfile.test unchanged (Caddy sends X-Forwarded-Proto/Host by default). Don't set `paths.origin` in vite.config.ts. Keep `csrf.trustedOrigins: ['*']`.
      Files: docker-compose.yml, docker-compose.test.yml
      Verify: `docker compose -f docker-compose.test.yml config` parses. In item 12, the password-protection.test.ts login, config forms and every other form-action E2E passes (these depend on CSRF/origin).

- [ ] 10. tsconfig + remaining config review.
      - Add `"exclude": ["node_modules", "build", ".svelte-kit"]` to tsconfig.json, as the guide says to declare both include and exclude. There's no service worker, so no service-worker exclude or sub-tsconfig.
      - Keep `sourceMap`/`strict`.
      - vite.config.ts: config already moved. There are no removed options (`files.lib`, `preloadStrategy`, `csrf.checkOrigin`, `prerender.origin`, `vitePlugin`). Don't add `server.cors`: nothing relies on cross-origin dev static assets.
      - `src/app.html`: `data-sveltekit-preload-data="hover"` is valid, and there are no `'off'` values anywhere.
      - `#lib` bare entry: `src/lib/index.js` doesn't exist and nothing imports bare `#lib`. Leave the codemod's mapping as documented.
      Files: tsconfig.json
      Verify: `npm run check` 0 errors / 0 warnings.

- [ ] 11. Kit 3 behaviour review (no code change expected; confirm each, and fix only if verification fails).
      a. **Cookies (cookie v2, path defaults to '/')**: management/+page.server.ts and management/config/+page.server.ts `cookies.set` already pass `path: '/'`. The `cookies.delete(COOKIE_NAME, { path: '/' })` in config is unchanged. The name `mgmt_session` is ASCII.
      b. **use:enhance**:
         - The only cross-page action is `src/routes/management/+layout.svelte` `action="/management?/login"`. Its callback is custom: it calls refreshAll and never calls `update()`. Kit 3's navigate-to-action-page behaviour only lives in the default `update()`/fallback callback (`node_modules/@sveltejs/kit/src/runtime/app/forms/client.js`), so users stay on the sub-page they were trying to open. All other forms post to `?/action` on the same page.
         - `fail()` statuses now reach the client, but callbacks branch on `result.type`, not status.
         - `update({ reset })` is still valid.
         - Verify via password-protection.test.ts, which logs in from sub-pages.
      c. **hooks.server.ts**: top-level migrate/seed/initWebSocket only. There's no `handle`/`handleError`, so the `resolve`/`handleError` changes don't apply. `error(404, 'string')` calls already use string messages, `redirect(303, '/management/...')` targets are internal, and there are no 204 responses.
      d. **Links to the current page now `refreshAll`** (Navbar). Harmless, but watch responsive-nav and realtime E2E.
      e. **Dev-mode WebSocket** (`src/lib/server/ws/vite-plugin.ts`). Best effort; mark it unverified if no local Postgres is available.
         - Start a throwaway DB: `docker run --rm -d --name slm-dev-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=boardgames postgres:17-alpine`.
         - Run `npm run dev` in the background with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boardgames`.
         - Confirm `/library` returns 200 and that a node `ws` client connects to `ws://localhost:5173/ws`.
         - Stop both and remove the container.
      Verify: item 12's E2E results, plus the dev smoke output (or a stated reason it was skipped).

- [ ] 12. Full verification.
      - Run `npm run check` (0/0), `npm run test` (262/262 on Vitest 5) and `npm run build`.
      - Run `npm run test:e2e` with a 30-minute timeout. All 28 files must pass, and the script always tears down.
      - If a test fails, fix the root cause (app or test). Don't weaken assertions.
      - Record the command outputs/pass counts in `.agents/tasks/sveltekit-3-upgrade/verification.md`.
      Verify: all four commands green.

- [ ] 13. Minor-bump changelog sanity check. Record a one-line conclusion per package in verification.md:
      - drizzle-orm 0.45.2→0.45.4 and drizzle-kit 0.31.10→0.31.11: patch releases.
      - pg 8.21→8.23: additive only, from the CHANGELOG: 8.22 adds `sslnegotiation=direct`, 8.23 adds query pipelining.
      - ws 8.21→8.22
      - papaparse 5.5.3→5.7.0: check github.com/mholt/PapaParse/releases for parse/unparse default changes. `csv.ts` uses `Papa.parse`/`unparse`.
      - svelte-hot-french-toast 4.0→4.1
      - @playwright/test 1.60→1.64

      Treat a package as safe if its release notes show no breaking changes and the csv/backup/realtime property + E2E suites pass.
      Verify: verification.md lists every package with its conclusion.

- [ ] 14. Docs/steering updates and cleanup.
      - `.kiro/steering/coding-conventions.md`:
        - "use `$lib/` alias" → `#lib/*` subpath imports (package.json `imports`) with explicit `.js` extensions (lines 9, 33)
        - API routes use `Response.json()` instead of `json()` (line 31)
        - `invalidateAll()` → `refreshAll()` (line 73)
        - add: `$app/state` (not `$app/stores`); env vars declared in `src/env.ts` and imported from `$app/env/private|public`; `goto` uses `replace`/`reset`
      - `.kiro/steering/project-overview.md`:
        - SvelteKit 2 → 3 (line 7)
        - debounced `refreshAll()` (line 135)
        - add `src/env.ts` to the structure tree
        - note that config lives in `vite.config.ts` (no svelte.config.js)
      - `.kiro/steering/testing.md`:
        - the `vi.mock('$app/navigation')` snippet → `refreshAll` (lines ~57-61)
        - the `#lib` import in the structure pattern (line 68)
        - line 104: aliases resolve via `#lib` package.json imports; `$app/*` via the SvelteKit plugin
        - mention Vitest 5 (`clearMocks` on by default)
      - `.kiro/steering/build-and-run.md`:
        - production entry step 3/4: `build/index.js` exports the `node:http` server directly (adapter-node 6, no Polka); fix the WebSocket table row "Polka's `server.server`" (line 76)
        - add `PROTOCOL_HEADER`/`HOST_HEADER` (ORIGIN removed) to the Docker section
        - note project config lives in `sveltekit({...})` in vite.config.ts and tsconfig extends `$app/tsconfig`
        - TS stays on 6 (D1)
      - README.md line 69: SvelteKit 2 → SvelteKit 3.
      - Delete the generated `MIGRATION_TASKS.md` (untracked), per its own final checklist, after confirming every task in it is handled. Remove any temp files, the dev container, and `test-results/` artifacts created during verification.
      Verify: `npm run check` and `npm run test` are still green. Searching src/, tests/ and .kiro/steering for `$lib/`, `invalidateAll`, `$app/stores`, `svelte.config.js` and `server.server` finds no stale guidance, other than intentional historical notes such as "formerly".

## Acceptance (overall)
- `npm run check` 0 errors/0 warnings. `npm run test` 262/262 on Vitest 5.0.x. `npm run build` OK. `npm run test:e2e` all pass.
- package.json: kit ^3.1.0, adapter-node ^6.0.0, vitest ^5.0.4, typescript ^6.0.3 (D1 documented).
- server.js works with adapter-node 6. `/ws` upgrades work in the prod container (realtime E2E).
- No `$lib`, `$app/stores`, `$env/`, `invalidateAll`, `json()`-from-kit, `keepFocus`, or `replaceState` left in src/ and tests/.
- Steering docs updated. MIGRATION_TASKS.md removed. No commits made.
