import { test, expect } from '@playwright/test';

/** Checkout a game through the UI */
async function checkoutGame(
	page: import('@playwright/test').Page,
	gameName: string,
	firstName: string,
	lastName: string,
	weight: string
) {
	await page.goto('/checkout');
	const card = page.locator('.game-card', { hasText: gameName }).first();
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Checkout' }).click();

	const form = page.locator('section[aria-label="Checkout form"]');
	await expect(form).toBeVisible();
	await form.locator('#attendeeFirstName').fill(firstName);
	await form.locator('#attendeeLastName').fill(lastName);
	await form.locator('#idType').selectOption({ index: 1 });
	await form.locator('#checkoutWeight').fill(weight);
	await form.getByRole('button', { name: 'Confirm Checkout' }).click();
	await expect(page.getByText('Game checked out successfully!')).toBeVisible();
}

/** Checkin a game through the UI */
async function checkinGame(
	page: import('@playwright/test').Page,
	gameName: string,
	weight: string
) {
	await page.goto('/checkin');
	const card = page.locator('.game-card', { hasText: gameName }).first();
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Check In' }).click();

	const form = page.locator('section[aria-label="Check in form"]');
	await expect(form).toBeVisible();
	await form.locator('#checkinWeight').fill(weight);
	await form.getByRole('button', { name: 'Confirm Check In' }).click();
	await expect(page.getByText('Game checked in successfully!')).toBeVisible();
}

test.describe('Statistics Page', () => {
	test('renders with seed data and displays metric cards', async ({ page }) => {
		await page.goto('/statistics');

		// Heading
		await expect(page.locator('.statistics-page h1')).toHaveText('Statistics');

		// Metric cards section visible
		const metrics = page.locator('section[aria-label="Key metrics"]');
		await expect(metrics).toBeVisible();

		// Verify key metric values with seed data (no checkouts)
		const totalCheckouts = metrics.locator('.metric-card', { hasText: 'Total Checkouts' });
		await expect(totalCheckouts.locator('.metric-value')).toHaveText('0');

		const available = metrics.locator('.metric-card', { hasText: 'Currently Available' });
		await expect(available.locator('.metric-value')).toHaveText('10');

		const checkedOut = metrics.locator('.metric-card', { hasText: 'Currently Checked Out' });
		await expect(checkedOut.locator('.metric-value')).toHaveText('0');
	});

	test('filter panel renders all filter options', async ({ page }) => {
		await page.goto('/statistics');

		// All filter inputs should be present
		await expect(page.locator('#filter-timeRangeStart')).toBeVisible();
		await expect(page.locator('#filter-timeRangeEnd')).toBeVisible();
		await expect(page.locator('#filter-timeOfDay')).toBeVisible();
		await expect(page.locator('#filter-gameTitle')).toBeVisible();
		await expect(page.locator('#filter-attendeeName')).toBeVisible();
		await expect(page.locator('#filter-status')).toBeVisible();
		await expect(page.locator('#filter-gameType')).toBeVisible();
		await expect(page.locator('#filter-groupByBgg')).toBeAttached();
	});

	test('statistics update after checkout', async ({ page }) => {
		// Checkout a game
		await checkoutGame(page, 'Catan', 'Stats', 'Tester', '30');

		// Navigate to statistics
		await page.goto('/statistics');

		const metrics = page.locator('section[aria-label="Key metrics"]');
		await expect(metrics).toBeVisible();

		// Total Checkouts should be at least 1
		const totalCheckouts = metrics.locator('.metric-card', { hasText: 'Total Checkouts' });
		const totalValue = await totalCheckouts.locator('.metric-value').textContent();
		expect(Number(totalValue)).toBeGreaterThanOrEqual(1);

		// Currently Checked Out should be at least 1
		const checkedOut = metrics.locator('.metric-card', { hasText: 'Currently Checked Out' });
		const checkedOutValue = await checkedOut.locator('.metric-value').textContent();
		expect(Number(checkedOutValue)).toBeGreaterThanOrEqual(1);

		// Top Games section should show the checked-out game
		const topGames = page.locator('section[aria-label="Top games by checkouts"]');
		await expect(topGames).toBeVisible();
		await expect(topGames.locator('h2')).toHaveText('Top Games');
		await expect(topGames.locator('.ranked-item').first()).toBeVisible();
		await expect(topGames.locator('.ranked-item').first().locator('.game-title')).toContainText('Catan');
	});

	test('no matching data message when filters exclude all results', async ({ page }) => {
		await page.goto('/statistics');

		// Type a nonexistent game title to filter out everything
		await page.locator('#filter-gameTitle').fill('ZZZZZ');
		// Wait for navigation/reload triggered by filter change
		await page.waitForURL(/gameTitle=ZZZZZ/);

		await expect(page.locator('.statistics-page .empty-message')).toHaveText('No matching data found.');
	});

	test('duration distribution section visible after checkout and checkin', async ({ page }) => {
		// Checkout then checkin to create a completed pair
		await checkoutGame(page, 'Pandemic', 'Duration', 'Tester', '25');
		await checkinGame(page, 'Pandemic', '25');

		await page.goto('/statistics');

		const distribution = page.locator('section[aria-label="Duration distribution"]');
		await expect(distribution).toBeVisible();
		await expect(distribution.locator('h2')).toHaveText('Duration Distribution');

		// Should have bar rows
		const barRows = distribution.locator('.bar-row');
		const count = await barRows.count();
		expect(count).toBeGreaterThan(0);

		// Each bar row should have a label and count
		const firstRow = barRows.first();
		await expect(firstRow.locator('.bar-label')).toBeVisible();
		await expect(firstRow.locator('.bar-count')).toBeVisible();
	});

	test('filter by game type updates statistics', async ({ page }) => {
		await page.goto('/statistics');

		// Select "Play & Win" game type filter
		await page.locator('#filter-gameType').selectOption('play_and_win');
		await page.waitForURL(/gameType=play_and_win/);

		// Page should still render (either with data or empty message)
		const statsPage = page.locator('.statistics-page');
		await expect(statsPage).toBeVisible();

		// Either metric cards or empty message should be present
		const hasMetrics = await page.locator('section[aria-label="Key metrics"]').isVisible().catch(() => false);
		const hasEmpty = await page.locator('.statistics-page .empty-message').isVisible().catch(() => false);
		expect(hasMetrics || hasEmpty).toBeTruthy();
	});
});
