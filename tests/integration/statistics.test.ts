import { test, expect } from './fixtures';

test.describe('Statistics Page', () => {
	test('renders and displays metric cards', async ({ page }) => {
		await page.goto('/management/statistics');

		await expect(page.locator('.statistics-page h1')).toHaveText('Statistics');

		const metrics = page.locator('section[aria-label="Key metrics"]');
		await expect(metrics).toBeVisible();

		// Verify metric card labels exist (don't assert exact values — other workers may have data)
		await expect(metrics.locator('.metric-card', { hasText: 'Total Checkouts' })).toBeVisible();
		await expect(metrics.locator('.metric-card', { hasText: 'Currently Available' })).toBeVisible();
		await expect(metrics.locator('.metric-card', { hasText: 'Currently Checked Out' })).toBeVisible();
	});

	test('filter panel renders all filter options', async ({ page }) => {
		await page.goto('/management/statistics');

		await expect(page.locator('#filter-timeRangeStart')).toBeVisible();
		await expect(page.locator('#filter-timeRangeEnd')).toBeVisible();
		await expect(page.locator('#filter-gameTitle')).toBeVisible();
		await expect(page.locator('#filter-attendeeName')).toBeVisible();
		await expect(page.locator('#filter-status')).toBeVisible();
		await expect(page.locator('#filter-gameType')).toBeVisible();
		await expect(page.locator('#filter-groupByBgg')).toBeAttached();
	});

	test('statistics update after checkout', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_StatsCO`);

		await helpers.checkoutGame(game.title, 'Stats', 'Tester', '30');

		await page.goto(`/management/statistics?gameTitle=${game.title}`);

		const metrics = page.locator('section[aria-label="Key metrics"]');
		await expect(metrics).toBeVisible();

		const totalCheckouts = metrics.locator('.metric-card', { hasText: 'Total Checkouts' });
		const totalValue = await totalCheckouts.locator('.metric-value').textContent();
		expect(Number(totalValue)).toBeGreaterThanOrEqual(1);

		// Top Games section should show the checked-out game
		const topGames = page.locator('section[aria-label="Top games by checkouts"]');
		await expect(topGames).toBeVisible();
		await expect(topGames.locator('h2')).toHaveText('Top Games');
		await expect(topGames.locator('.ranked-item').first()).toBeVisible();
	});

	test('no matching data message when filters exclude all results', async ({ page }) => {
		await page.goto('/management/statistics');

		await page.locator('#filter-gameTitle').fill('ZZZZZ_no_match_ever');
		await page.waitForURL(/gameTitle=ZZZZZ_no_match_ever/);

		await expect(page.locator('.statistics-page .empty-message')).toHaveText('No matching data found.');
	});

	test('duration distribution section visible after checkout and checkin', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_StatsDur`);

		await helpers.checkoutGame(game.title, 'Duration', 'Tester', '25');
		await helpers.checkinGame(game.title, '25');

		await page.goto(`/management/statistics?gameTitle=${game.title}`);

		const distribution = page.locator('section[aria-label="Duration distribution"]');
		await expect(distribution).toBeVisible();
		await expect(distribution.locator('h2')).toHaveText('Checkouts by Duration');

		const barRows = distribution.locator('.bar-row');
		const count = await barRows.count();
		expect(count).toBeGreaterThan(0);

		const firstRow = barRows.first();
		await expect(firstRow.locator('.bar-label')).toBeVisible();
		await expect(firstRow.locator('.bar-count')).toBeVisible();
	});

	test('filter by game type updates statistics', async ({ page }) => {
		await page.goto('/management/statistics');

		await page.locator('#filter-gameType').selectOption('play_and_win');
		await page.waitForURL(/gameType=play_and_win/);

		const statsPage = page.locator('.statistics-page');
		await expect(statsPage).toBeVisible();
	});
});
