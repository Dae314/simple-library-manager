# SvelteKit 3, adapter-node 6 and Vitest 5 upgrade

The change moves the app from SvelteKit 2 / adapter-node 5 / Vitest 4 to SvelteKit 3.1 / adapter-node 6 / Vitest 5, and bumps the other dependencies by minor or patch versions. `sv migrate sveltekit-3` did the mechanical work: `#lib` subpath imports, `$app/state`, `$app/env/private` plus `src/env.ts`, folding svelte.config.js into `sveltekit({...})`, and `tsconfig` extending `$app/tsconfig`. The formatting churn the codemod introduced was reverted. The remaining breaking changes were done by hand: `refreshAll`, the `goto` option renames, `Response.json`, the adapter-node 6 `server` export in server.js, and replacing `ORIGIN` with proxy headers. TypeScript stays on 6.x, and that decision is justified. The verification note reports check 0/0, 262/262 property tests on Vitest 5, a clean build, and 197/198 E2E passing (one pre-existing skip) against the Docker image, which covers the realtime `/ws` tests.

Watch for: the user-visible scroll-retention change from `reset: false` on filter inputs (confirmed, intended). The production request origin now resolves to `http://` instead of adapter-node's implicit `https://` default (confirmed, a correctness improvement). The bare `#lib` import mapping points at a file that doesn't exist (confirmed, harmless).

**Verdict**: APPROVED

## High-level view

The migration is complete against the plan. Searches of src/, tests/, server.js, scripts/ and the config files turn up no `$lib`, `$app/stores`, `$page`, `$env/`, `invalidateAll`, `keepFocus`, `replaceState` or `noScroll`. The remaining `@sveltejs/kit` imports are `fail`/`error`/`redirect`, which are still valid in Kit 3. The per-file diffs are now semantic-only: imports, `page`, env, `goto` options and `refreshAll`.

server.js now destructures `server` directly as the `node:http` Server, which matches adapter-node 6's `export { httpServer as server }`. Without this, the old `server.server` would have been `undefined` and the `upgrade` listener would have thrown at startup. The realtime E2E suite passing against the production image exercises `/ws` end to end.

`ORIGIN` is replaced by `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` in both compose files. Caddy overwrites these headers for untrusted clients, and the app port is only `expose`d, so they can't be spoofed by bypassing the proxy. `csrf.trustedOrigins: ['*']` is carried over unchanged, so the CSRF and auth posture is equivalent: not weakened and not tightened. Session cookies already set `path: '/'`, so cookie v2's default path change has no effect.

No server-only split was needed. Every client import from `#lib/server/**` (including `events.ts` in websocket.svelte.ts and the dialogs) is `import type`. Under `verbatimModuleSyntax` these are erased, and the build succeeding confirms Kit's server-only guard is happy.

Config and docs are consistent. svelte.config.js is deleted, and its adapter/preprocess/csrf moved verbatim into `sveltekit({...})`. tsconfig extends `$app/tsconfig` with explicit include/exclude. The Dockerfile needs nothing new, because `#lib` is resolved at bundle time. The steering files and README describe the new conventions. Holding TypeScript at ^6 is sound: Kit 3.1 peers on ^6, svelte-check 4.7.6 peers on ^5 || ^6, and TS 7 no longer exports the compiler API that svelte2tsx uses.

<details>
<summary>Issues (3)</summary>

1. **Scroll retention on filter changes** — `{ replace: true, reset: false }` keeps both focus and scroll position. Before, only focus was kept. Mention it in the final report to the user (non-blocking, intended).
2. **Dead bare `#lib` mapping** — `"#lib": "./src/lib/index.js"` targets a file that doesn't exist, and nothing imports bare `#lib`. Optionally drop that entry (non-blocking).
3. **Stale `createInvalidateDebouncer` name** — the function now wraps `refreshAll`. The plan chose to keep the name, so a rename is an optional follow-up (non-blocking).

</details>

<details>
<summary>Details</summary>

### adapter-node 6 origin derivation vs. the previous behaviour

Before, the test compose file set `ORIGIN=http://localhost:8080` and production set no origin. adapter-node 5 then derived the production origin from `Host` and assumed `https`. The new headers give an accurate `http://<lan-host>` origin in both environments (confirmed from the compose diff and the plan's reading of `get_origin`). With `trustedOrigins: ['*']` the CSRF check didn't depend on the origin before and doesn't now. The only observable difference is that `url.protocol`/`url.origin` inside handlers is now correct. Nothing in src reads it for security decisions. The trust model depends on the app port never being published. That constraint is documented in both the compose comments and build-and-run.md. A future change that publishes port 3000 would let clients forge `X-Forwarded-Host`.

### Navigation option renames

All 20 `goto` calls use either a `new URL(window.location.href)` copy or `page.url.pathname`, so the Kit 3 "reject unresolved URL" behaviour can't trigger. `page.url` is never mutated (confirmed by search). The one `page.url.searchParams.get('deleted')` read in management/games is fine. Switching `keepFocus` to `reset: false` also retains scroll position, which is the documented 1:1 replacement (likely acceptable UX, flagged for the user).

### Test coverage

Vitest 5 needed no config changes. `vi.mock` calls are top-level, and the `$app/navigation` mocks now export `refreshAll`, so the debouncer test still asserts against the real import name. Not tested: the dev-mode Vite WebSocket plugin has no automated test, only a manual smoke test (`GET /library` 200, `/ws` open) recorded in verification.md.

</details>

<details>
<summary>File map</summary>

- package.json / package-lock.json — kit ^3.1.0, adapter-node ^6.0.0, vitest ^5.0.4, minor bumps, `imports` field
- vite.config.ts — absorbs svelte.config.js options; svelte.config.js deleted
- tsconfig.json — extends `$app/tsconfig`, explicit include/exclude
- server.js — adapter-node 6 `server` export (no Polka)
- docker-compose.yml, docker-compose.test.yml — PROTOCOL_HEADER/HOST_HEADER, ORIGIN removed
- src/env.ts (new) — `ALLOW_TEST_RESET` declaration
- src/** — `#lib` imports, `$app/state`, `refreshAll`, `goto` options, `Response.json`, `$app/env/private`
- tests/properties/** — `#lib` imports, `refreshAll` mocks
- .gitignore — `.vitest/`
- .kiro/steering/*, README.md — conventions updated for Kit 3

Full diff: `git diff` in the repo root.

</details>
