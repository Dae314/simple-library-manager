import { test, expect } from './fixtures';

test.describe('Retired Games Visibility', () => {
	test('retired game disappears from checkout page', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RetVis1`);

		// Verify visible on checkout
		await page.goto(`/checkout?search=${game.title}`);
		await expect(helpers.tableRow(page, game.title)).toBeVisible();

		// Retire via management
		await page.goto(`/management/games?search=${game.title}`);
		await page.locator(`button[aria-label="Retire ${game.title}"]`).click();
		await expect(page.getByText(`Retired "${game.title}"`)).toBeVisible();

		// Should be gone from checkout
		await page.goto(`/checkout?search=${game.title}`);
		await expect(helpers.tableRow(page, game.title)).not.toBeVisible();
	});

	test('retired game disappears from checkin page', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RetVis2`);

		// Checkout the game so it appears on checkin
		await helpers.checkoutGame(game.title, 'Retire', 'Test', '20');

		// Verify visible on checkin
		await page.goto('/checkin');
		await expect(helpers.tableRow(page, game.title)).toBeVisible();

		// Retire via management
		await page.goto(`/management/games?search=${game.title}`);
		await page.locator(`button[aria-label="Retire ${game.title}"]`).click();
		await expect(page.getByText(`Retired "${game.title}"`)).toBeVisible();

		// Should be gone from checkin
		await page.goto('/checkin');
		await expect(helpers.tableRow(page, game.title)).not.toBeVisible();
	});

	test('restoring a retired game makes it appear on checkout page again', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RetVis3`);

		// Retire
		await page.goto(`/management/games?search=${game.title}`);
		await page.locator(`button[aria-label="Retire ${game.title}"]`).click();
		await expect(page.getByText(`Retired "${game.title}"`)).toBeVisible();

		// Verify NOT on checkout
		await page.goto(`/checkout?search=${game.title}`);
		await expect(helpers.tableRow(page, game.title)).not.toBeVisible();

		// Restore — need to filter by retired status to see the game
		await page.goto(`/management/games?search=${game.title}&status=retired`);
		await expect(helpers.tableRow(page, game.title)).toBeVisible();
		await page.locator(`button[aria-label="Restore ${game.title}"]`).click();
		await expect(page.getByText('Restored')).toBeVisible();

		// Should be back on checkout
		await page.goto(`/checkout?search=${game.title}`);
		await expect(helpers.tableRow(page, game.title)).toBeVisible();
	});

	test('retired game still visible in management area with retired filter', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RetVis4`);

		await page.goto(`/management/games?search=${game.title}`);

		await page.locator(`button[aria-label="Retire ${game.title}"]`).click();
		await expect(page.getByText(`Retired "${game.title}"`)).toBeVisible();

		// Game is hidden from default view, but visible with retired filter
		await page.goto(`/management/games?search=${game.title}&status=retired`);
		const row = helpers.tableRow(page, game.title);
		await expect(row).toBeVisible();

		const retiredBadge = row.locator('.status-indicator.retired');
		await expect(retiredBadge).toBeVisible();
		await expect(retiredBadge).toHaveText('Retired');
	});
});
