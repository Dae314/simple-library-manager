# Verification: SvelteKit 3 + major package upgrades (iteration 1)

All commands run from the repo root on Windows / Node v24.21.0. Nothing committed. Working tree has all changes applied.

## Results

| Command | Result |
|---|---|
| `npm install` | exit 0, no ERESOLVE / peer warnings (only npm's "install-scripts not covered by allowScripts" notice for esbuild) |
| `npm ls --depth=0` | clean: kit 3.1.0, adapter-node 6.0.0, vitest 5.0.4, vite 8.3.4, svelte 5.57.2, svelte-check 4.7.6, typescript 6.0.3 |
| `npm outdated` | only `typescript 6.0.3 → 7.0.2` (held back, see below) |
| `npm run check` | `svelte-check found 0 errors and 0 warnings` (was 5 `keepFocus` errors after the codemod) |
| `npm run test` | `RUN v5.0.4`, **19 files / 262 tests passed** (baseline 262), no deprecation output |
| `npm run build` | succeeds (ssr + client + adapter-node "done") |
| `npm run test:e2e` | **197 passed, 1 skipped, 0 failed** (198 tests, 28 files). The skip is the pre-existing `test.skip` pg_dump round-trip in backup-restore.test.ts. Teardown ran (via scripts/run-e2e.js `finally`); `docker ps -a` shows no leftover containers |
| Dev-mode smoke | throwaway `postgres:17-alpine` + programmatic Vite dev server: migrations + seed ran, `GET /library → 200`, `ws://localhost:5199/ws → open`. Container stopped (`--rm`), script deleted |

First E2E attempt failed at `browserType.launch` for every test: @playwright/test 1.64 needs chromium-headless-shell build 1248, which wasn't installed. Fixed with `npx playwright install chromium` (environment only, no repo change). The rerun is the result above.

## server.js vs adapter-node 6 (checked against build output)

- `build/index.js` = `export * from './server/adapter-index.js'`. That file has `var httpServer = http.createServer()` and `export { host, path, port, httpServer as server }`. So `server` is the `node:http` Server itself and the old `server.server` (Polka) would be `undefined`.
- server.js now does `const { server: httpServer } = await import('./build/index.js')`. The upgrade handler and `/ws` path are unchanged.
- `process.emit("sveltekit:shutdown", reason)` is still present in adapter-index.js, so the shutdown listener stays.
- Prod `/ws` upgrade is exercised by the realtime-* E2E files against the Docker image. All passed.
- No `@sveltejs/kit/node/polyfills` imports exist. There are no `#lib/` references in `build/server`, because subpath imports are resolved at bundle time. The Dockerfile is unchanged, and the image built and ran in E2E.

## ORIGIN decision (D2)

- `ORIGIN` was removed in adapter-node 6. Prod is behind Caddy on port 80 with no fixed hostname, so `paths.origin` is not used. `build/adapter-node.js` has `origin = undefined`.
- Added `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` to the `app` service in docker-compose.yml and docker-compose.test.yml. Caddy sets and overwrites these headers. The app is only `expose`d, never published.
- Removed the ignored `ORIGIN=http://localhost:8080` line from docker-compose.test.yml. Nothing reads `process.env.ORIGIN`.
- `csrf.trustedOrigins: ['*']` is unchanged, so the CSRF posture matches the previous one.
- Session cookies already set `path: '/'`, `httpOnly`, `sameSite: 'lax'`, `secure: false`, so cookie v2's default path changes nothing.
- The login, config and form-action E2E tests pass.

## Packages held back

- **typescript stays ^6.0.3.** @sveltejs/kit 3.1.0 peers on `typescript ^6.0.0` and svelte-check 4.7.6 (latest) peers on `^5 || ^6`. typescript@7 (native port) no longer exports the JS compiler/language-service API that svelte-check and svelte2tsx use.

## Minor/patch bumps (from the earlier `npm update --save`)

- drizzle-orm 0.45.2→0.45.4, drizzle-kit 0.31.10→0.31.11: patch releases. DB-backed E2E passes.
- pg 8.21→8.23: additive (sslnegotiation=direct, pipelining). Safe.
- ws 8.21→8.22: minor. Realtime property tests and E2E pass.
- papaparse 5.5.3→5.7.0: per the [releases](https://github.com/mholt/PapaParse/releases), 5.6 removed the jQuery dependency and 5.7 added a `downloadTimeout` option. No parse/unparse default changes; csv property tests and csv E2E pass.
- svelte-hot-french-toast 4.0→4.1: minor. Toast assertions pass in E2E.
- @playwright/test 1.60→1.64: needs a newer browser build (`npx playwright install chromium`). No test changes needed.

## What `sv migrate` did vs. hand work

The codemod (`npx sv migrate sveltekit-3 --tasks all`, run during planning) did:

- kit/adapter-node bumps
- package.json `imports` (`#lib`)
- `$lib` → `#lib` with extensions
- `$app/stores` → `$app/state`
- `$env/dynamic/private` → `$app/env/private` + `src/env.ts`
- moved svelte.config.js into `sveltekit({...})` and deleted it
- tsconfig `extends: "$app/tsconfig"`
- generated MIGRATION_TASKS.md

Done by hand in this step:

1. Reverted the codemod's formatting churn in 6 files: config, games, games/[id] and backup `+page.svelte`, plus api/test-helpers and api/test-reset `+server.ts`. Each was restored from HEAD and only the semantic edits were reapplied. `git diff --ignore-all-space` on them now shows only import/`page`/env lines.
2. `@sveltejs/kit` → `^3.1.0`, `vitest` → `^5.0.4`. Added `.vitest/` to .gitignore.
3. Vitest 5 review: no config or test changes needed. The suite passes as-is, including `clearMocks` default true.
4. `invalidateAll` → `refreshAll` in src and test mocks/comments (`mockInvalidateAll` → `mockRefreshAll`). `createInvalidateDebouncer` name kept. `page.state`/shallow routing is unused.
5. `goto` options: `{ replaceState: true, keepFocus: true }` → `{ replace: true, reset: false }`, and `{ replaceState: true }` → `{ replace: true }`, in library, attendees, games, statistics and transactions. All destinations are copies of the current URL or internal routes. Nuance: `reset: false` also keeps the scroll position on filter changes, not just focus.
6. `json()` → `Response.json()` in api/attendees/search and api/games/available. Status codes kept. api/test-helpers uses its own local `json()` helper, so it was left alone.
7. `src/env.ts`: removed the `@migration-task` comment and added a description. The schema still returns `''` when unset, so the routes' `!== 'true'` guard is unchanged. E2E `/api/test-reset` works with runtime-only `ALLOW_TEST_RESET=true`.
8. server.js adapted for adapter-node 6 (see above).
9. docker-compose ORIGIN → PROTOCOL_HEADER/HOST_HEADER (see above).
10. tsconfig: added `"exclude": ["node_modules", "build", ".svelte-kit"]`.
11. Behaviour review, no code change needed:
    - cookies already use `path: '/'`.
    - The only cross-page enhanced form (`/management?/login` in management/+layout.svelte) has a custom callback that never calls `update()`, so users stay on the sub-page. password-protection E2E passes.
    - hooks.server.ts has no `handle`/`handleError`.
    - No `data-sveltekit-*="off"`.
    - `page.url` is only read. Mutations use `new URL(window.location.href)` copies.
    - D7: client imports from `#lib/server/**` are all `import type`. The build succeeds, so `events.ts` wasn't moved.
12. Steering docs updated:
    - coding-conventions: `#lib`, `Response.json`, `refreshAll`, `$app/state`, goto options, `src/env.ts` + `$app/env`, vite.config config, tsconfig/TS 6
    - project-overview: SvelteKit 3, `refreshAll`, env.ts + vite.config.ts in the tree
    - testing: `refreshAll` mock, `#lib` import, alias resolution, Vitest 5 `clearMocks`
    - build-and-run: adapter-node 6 `server` export, no Polka, PROTOCOL_HEADER/HOST_HEADER, project config section, TS hold
    - README: SvelteKit 3.
13. Deleted MIGRATION_TASKS.md after every task in it was handled. Removed temp scripts, `test-results/`, and logs.

Search of src/ and tests/ for `$lib`, `$app/stores`, `$env/`, `invalidateAll`, `keepFocus`, `replaceState`, and `json` from `@sveltejs/kit`: no matches.
