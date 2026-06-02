import { request } from '@playwright/test';

const BASE = 'http://localhost:8080';

/**
 * Playwright global setup: warm up the server before the parallel test
 * workers start.
 *
 * The Docker healthchecks only exercise `/`, so on a freshly-started
 * environment the `/library` page and its `?/checkout` + `?/checkin` action
 * handlers are cold. When 4 workers stampede those cold routes at once, the
 * first checkout round-trip can exceed the 5s `expect` timeout and tests fail
 * on their setup step (e.g. `helpers.checkoutGame`).
 *
 * This routine imports the route modules, primes the pg connection pool, and
 * exercises the full checkout/checkin write path once, so the first real test
 * hits a warm server. All steps are best-effort — failures here must never
 * fail the suite.
 */
export default async function globalSetup(): Promise<void> {
	const ctx = await request.newContext({ baseURL: BASE });

	try {
		// Wait until the app responds at all (Caddy + app may still be settling).
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			try {
				const res = await ctx.get('/');
				if (res.ok()) break;
			} catch {
				// not up yet
			}
			await new Promise((r) => setTimeout(r, 1000));
		}

		// Warm the GET routes that tests navigate to. This imports each route's
		// server module (load + actions live in the same module) and primes the
		// DB connection pool.
		const routes = [
			'/',
			'/library',
			'/library?status=checked_out',
			'/management',
			'/management/games',
			'/management/games/new',
			'/management/config',
			'/management/transactions',
			'/management/statistics',
			'/api/attendees/search?q=ab&field=firstName'
		];
		await Promise.all(
			routes.map((path) => ctx.get(path).catch(() => undefined))
		);

		// Warm the checkout + checkin action path end-to-end with a throwaway
		// game, then clean it up. This JITs the transaction service and DB write
		// path so the first real test's setup checkout is fast.
		await warmCheckoutCheckin(ctx);
	} finally {
		await ctx.dispose();
	}
}

async function warmCheckoutCheckin(ctx: import('@playwright/test').APIRequestContext): Promise<void> {
	try {
		const createRes = await ctx.post('/api/test-helpers', {
			data: { action: 'createGame', title: `__warmup_${Date.now()}`, bggId: 99999 }
		});
		if (!createRes.ok()) return;
		const game = await createRes.json();

		// SvelteKit CSRF requires a matching Origin header for form-encoded POSTs.
		const actionHeaders = {
			origin: BASE,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		};

		await ctx
			.post('/library?/checkout', {
				headers: actionHeaders,
				data: new URLSearchParams({
					gameId: String(game.id),
					gameVersion: String(game.version),
					attendeeFirstName: 'Warm',
					attendeeLastName: 'Up',
					idType: "Driver's License",
					checkoutWeight: '30',
					note: ''
				}).toString()
			})
			.catch(() => undefined);

		await ctx
			.post('/library?/checkin', {
				headers: actionHeaders,
				data: new URLSearchParams({
					gameId: String(game.id),
					checkinWeight: '30',
					note: ''
				}).toString()
			})
			.catch(() => undefined);

		await ctx
			.post('/api/test-helpers', { data: { action: 'deleteGames', ids: [game.id] } })
			.catch(() => undefined);
	} catch {
		// Best-effort warm-up; ignore any failure.
	}
}
