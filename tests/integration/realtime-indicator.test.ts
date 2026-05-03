import { test, expect } from './fixtures';

test.describe('Real-Time: Connection Indicator Visibility', () => {
	const LIVE_UPDATE_PAGES = [
		{ path: '/library', name: 'Library' },
		{ path: '/management/games', name: 'Management Games' },
		{ path: '/management/transactions', name: 'Management Transactions' }
	];

	const STATIC_PAGES = [
		{ path: '/', name: 'Home' },
		{ path: '/management/statistics', name: 'Statistics' },
		{ path: '/management/config', name: 'Management Config' },
		{ path: '/management/backup', name: 'Management Backup' },
		{ path: '/management/games/new', name: 'Management Games New' }
	];

	for (const { path, name } of LIVE_UPDATE_PAGES) {
		test(`connection indicator is visible and shows live state on ${name} (${path})`, async ({ page }) => {
			await page.goto(path);

			const indicator = page.locator('.connection-indicator');
			await expect(indicator).toBeVisible({ timeout: 10_000 });

			// Should show connected state (green dot)
			const connectedDot = indicator.locator('.dot.connected');
			await expect(connectedDot).toBeVisible({ timeout: 10_000 });

			// Screen-reader text should indicate live
			await expect(indicator.locator('.sr-only')).toHaveText('Live updates active');
		});
	}

	test('connection indicator is visible on game edit page', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTIndicatorEdit`);

		await page.goto(`/management/games/${game.id}`);

		const indicator = page.locator('.connection-indicator');
		await expect(indicator).toBeVisible({ timeout: 10_000 });

		const connectedDot = indicator.locator('.dot.connected');
		await expect(connectedDot).toBeVisible({ timeout: 10_000 });

		await expect(indicator.locator('.sr-only')).toHaveText('Live updates active');
	});

	for (const { path, name } of STATIC_PAGES) {
		test(`connection indicator is NOT present on ${name} (${path})`, async ({ page }) => {
			await page.goto(path);

			// Wait for page to fully load
			await page.waitForLoadState('networkidle');

			// Connection indicator should not be present on static pages
			await expect(page.locator('.connection-indicator')).not.toBeVisible();
		});
	}
});
