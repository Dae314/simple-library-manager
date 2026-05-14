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
		await expect(page.locator('#filter-prizeType')).toBeVisible();
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
		await expect(topGames.locator('tbody tr').first()).toBeVisible();
	});

	test('no matching data message when filters exclude all results', async ({ page }) => {
		// Navigate directly with the filter param to avoid debounce/timing issues
		await page.goto('/management/statistics?gameTitle=ZZZZZ_no_match_ever');

		await expect(page.locator('.statistics-page .empty-message')).toHaveText('No matching data found.');
	});

	test('duration distribution section visible after checkout and checkin', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_StatsDur`);

		await helpers.checkoutGame(game.title, 'Duration', 'Tester', '25');
		await helpers.checkinGame(game.title, '25');

		await page.goto(`/management/statistics?gameTitle=${game.title}`);

		const distribution = page.locator('section[aria-label="Duration distribution"]');
		await expect(distribution).toBeVisible();
		await expect(distribution.locator('h2')).toHaveText('Game Playtime');

		const barRows = distribution.locator('.bar-row');
		const count = await barRows.count();
		expect(count).toBeGreaterThan(0);

		const firstRow = barRows.first();
		await expect(firstRow.locator('.bar-label')).toBeVisible();
		await expect(firstRow.locator('.bar-count')).toBeVisible();
	});

	test('filter by game type updates statistics', async ({ page }) => {
		await page.goto('/management/statistics');

		await page.locator('#filter-prizeType').selectOption('play_and_win');
		await page.waitForURL(/prizeType=play_and_win/);

		const statsPage = page.locator('.statistics-page');
		await expect(statsPage).toBeVisible();
	});

	test('checkouts by time chart shows data after checkout', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TimeChart`);

		await helpers.checkoutGame(game.title, 'Time', 'Chart', '30');

		// Use today's date in HST as the time range to avoid depending on convention config state
		const hstNow = new Date(Date.now() + (-10) * 60 * 60_000);
		const today = hstNow.toISOString().slice(0, 10);
		await page.goto(`/management/statistics?gameTitle=${game.title}&timeRangeStart=${today}&timeRangeEnd=${today}`);

		const timeSection = page.locator('section[aria-label="Checkouts over time"]');
		await expect(timeSection).toBeVisible();

		// The chart should have data (not show empty message)
		await expect(timeSection.locator('.empty-message')).toHaveCount(0);

		// Should have at least one column with a non-zero count
		const nonZeroCounts = timeSection.locator('.column-count:not(.hidden)');
		const countNum = await nonZeroCounts.count();
		expect(countNum).toBeGreaterThan(0);
	});

	test('checkouts by time chart shows correct hour for recent checkout', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TimeHour`);

		await helpers.checkoutGame(game.title, 'Hour', 'Test', '30');

		// Filter to just today (in HST) so we get hourly granularity
		const now = new Date();
		const hstOffset = -10;
		const hstNow = new Date(now.getTime() + hstOffset * 60 * 60_000);
		const today = hstNow.toISOString().slice(0, 10);
		await page.goto(`/management/statistics?gameTitle=${game.title}&timeRangeStart=${today}&timeRangeEnd=${today}`);

		const timeSection = page.locator('section[aria-label="Checkouts over time"]');
		await expect(timeSection).toBeVisible();

		// Should show hourly view (h2 says "Checkouts by Hour")
		await expect(timeSection.locator('h2')).toHaveText('Checkouts by Hour');

		// Get the current hour in HST (UTC-10), matching the server timezone
		const hstHour = (now.getUTCHours() + hstOffset + 24) % 24;
		const period = hstHour < 12 ? 'AM' : 'PM';
		const display = hstHour === 0 ? 12 : hstHour > 12 ? hstHour - 12 : hstHour;
		const expectedLabel = `${display}${period}`;

		// The column for the current hour should have a count of at least 1
		// Labels may be hidden to avoid overlap, so locate via aria-label on the bar
		const hourBar = timeSection.locator(`[role="meter"][aria-label^="${expectedLabel}:"]`);
		await expect(hourBar).toBeVisible();
		const hourColumn = hourBar.locator('..');
		const countText = await hourColumn.locator('.column-count').textContent();
		expect(Number(countText)).toBeGreaterThanOrEqual(1);
	});

	test('checkouts by time chart only shows a subset of x-axis labels to avoid overlap', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TimeLabels`);

		await helpers.checkoutGame(game.title, 'Label', 'Test', '30');

		// Filter to just today (in HST) so we get hourly granularity (24 columns)
		const now = new Date();
		const hstOffset = -10;
		const hstNow = new Date(now.getTime() + hstOffset * 60 * 60_000);
		const today = hstNow.toISOString().slice(0, 10);
		await page.goto(`/management/statistics?gameTitle=${game.title}&timeRangeStart=${today}&timeRangeEnd=${today}`);

		const timeSection = page.locator('section[aria-label="Checkouts over time"]');
		await expect(timeSection).toBeVisible();

		// There should be 24 columns (one per hour)
		const allColumns = timeSection.locator('.chart-column');
		await expect(allColumns).toHaveCount(24);

		// But only a subset of labels should be visible (not all 24)
		const visibleLabels = timeSection.locator('.column-label:not(.column-label-hidden)');
		const visibleCount = await visibleLabels.count();
		expect(visibleCount).toBeGreaterThan(0);
		expect(visibleCount).toBeLessThan(24);

		// First and last labels should always be visible
		const firstLabel = allColumns.first().locator('.column-label');
		await expect(firstLabel).not.toHaveClass(/column-label-hidden/);
		const lastLabel = allColumns.last().locator('.column-label');
		await expect(lastLabel).not.toHaveClass(/column-label-hidden/);
	});

	test('duration chart updates when convention day filter excludes data', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_DurFilter`);

		await helpers.checkoutGame(game.title, 'Dur', 'Filter', '25');
		await helpers.checkinGame(game.title, '25');

		// Verify duration data exists without filter
		await page.goto(`/management/statistics?gameTitle=${game.title}`);
		const distribution = page.locator('section[aria-label="Duration distribution"]');
		await expect(distribution).toBeVisible();
		await expect(distribution.locator('.bar-row')).toHaveCount(4);

		// At least one bar should have a non-zero count
		const counts = distribution.locator('.bar-count');
		const allCounts = await counts.allTextContents();
		const total = allCounts.reduce((sum, c) => sum + Number(c), 0);
		expect(total).toBeGreaterThan(0);

		// Now filter to a date range that excludes the data (far future)
		await page.goto(`/management/statistics?gameTitle=${game.title}&timeRangeStart=2099-01-01&timeRangeEnd=2099-01-02`);

		// Duration chart should show empty or all zeros
		const filteredDistribution = page.locator('section[aria-label="Duration distribution"]');
		const emptyMsg = filteredDistribution.locator('.empty-message');
		const hasEmpty = await emptyMsg.count();

		if (hasEmpty > 0) {
			await expect(emptyMsg).toHaveText('No completed checkouts to display.');
		} else {
			// All bar counts should be 0
			const filteredCounts = await filteredDistribution.locator('.bar-count').allTextContents();
			const filteredTotal = filteredCounts.reduce((sum, c) => sum + Number(c), 0);
			expect(filteredTotal).toBe(0);
		}
	});

	test('checkouts by time chart is empty when date filter excludes all data', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TimeEmpty`);

		await helpers.checkoutGame(game.title, 'Empty', 'Time', '30');

		// Filter to a date range with no data
		await page.goto(`/management/statistics?gameTitle=${game.title}&timeRangeStart=2099-01-01&timeRangeEnd=2099-01-02`);

		const timeSection = page.locator('section[aria-label="Checkouts over time"]');
		await expect(timeSection).toBeVisible();
		await expect(timeSection.locator('.empty-message')).toHaveText('No checkout data to display.');
	});
});
