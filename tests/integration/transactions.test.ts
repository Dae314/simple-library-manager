import { test, expect } from './fixtures';

test.describe('Transaction Log and Reversals', () => {
	test('transaction log shows entries after checkout', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TxLog`);

		await helpers.checkoutGame(game.title, 'Alice', 'Test', '30');

		await page.goto(`/management/transactions?gameTitle=${helpers.prefix}_TxLog`);
		await expect(page.locator('h1')).toContainText('Transaction Log');

		const txRow = helpers.tableRow(page, game.title).first();
		await expect(txRow).toBeVisible();
		await expect(txRow.locator('.type-badge.checkout')).toHaveText('Checkout');
		await expect(txRow).toContainText('Alice Test');
	});

	test('transaction log shows both checkout and checkin entries', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TxBoth`);

		await helpers.checkoutGame(game.title, 'Bob', 'Tester', '25');
		await helpers.checkinGame(game.title, '25');

		await page.goto(`/management/transactions?gameTitle=${helpers.prefix}_TxBoth`);

		const rows = helpers.tableRow(page, game.title);
		await expect(rows).toHaveCount(2);

		await expect(rows.locator('.type-badge.checkout')).toHaveCount(1);
		await expect(rows.locator('.type-badge.checkin')).toHaveCount(1);
	});

	test('filter by transaction type', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TxFilter`);

		await helpers.checkoutGame(game.title, 'Carol', 'Filter', '20');

		await page.goto(`/management/transactions?gameTitle=${helpers.prefix}_TxFilter`);

		// Wait for the table to load with data
		await expect(helpers.tableRow(page, game.title).first()).toBeVisible();

		const typeSelect = page.locator('#filter-type');
		await typeSelect.selectOption('checkout');
		await expect(page).toHaveURL(/type=checkout/, { timeout: 10_000 });

		const typeBadges = page.locator('tbody .type-badge');
		const count = await typeBadges.count();
		expect(count).toBeGreaterThan(0);
		for (let i = 0; i < count; i++) {
			await expect(typeBadges.nth(i)).toHaveClass(/checkout/);
		}
	});

	test('filter by game title', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_TxSearch`);

		await helpers.checkoutGame(game.title, 'Dave', 'Search', '28');

		await page.goto('/management/transactions');

		const gameTitleInput = page.locator('#filter-gameTitle');
		await gameTitleInput.click();
		await gameTitleInput.pressSequentially(game.title, { delay: 10 });

		// Wait for the filtered results to appear (debounced search triggers navigation)
		const gameTitles = page.locator('tbody .game-title');
		await expect(gameTitles.first()).toContainText(game.title, { timeout: 10_000 });

		const count = await gameTitles.count();
		expect(count).toBeGreaterThan(0);
		for (let i = 0; i < count; i++) {
			await expect(gameTitles.nth(i)).toContainText(game.title);
		}
	});

	test('reverse a checkout', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RevCO`);

		await helpers.checkoutGame(game.title, 'Eve', 'Reverse', '35');

		await page.goto(`/management/transactions?gameTitle=${helpers.prefix}_RevCO`);

		const txRow = helpers.tableRow(page, game.title)
			.filter({ hasText: 'Eve Reverse' })
			.filter({ has: page.locator('.type-badge.checkout') })
			.first();
		await expect(txRow).toBeVisible();

		await txRow.locator('.btn-reverse').click();

		await expect(page.getByText('Checkout reversed successfully')).toBeVisible();

		// Corrective transaction should appear
		const correctionBadge = helpers.tableRow(page, game.title).locator('.correction-badge');
		await expect(correctionBadge.first()).toBeVisible();

		// Corrective transactions should not have reversal buttons
		const correctionRow = helpers.tableRow(page, game.title)
			.filter({ has: page.locator('.correction-badge') })
			.first();
		await expect(correctionRow.locator('.btn-reverse')).toHaveCount(0);

		// Game should be back to available
		await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
		await expect(helpers.tableRow(page, game.title).first()).toBeVisible();
	});

	test('reverse a checkin', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RevCI`);

		await helpers.checkoutGame(game.title, 'Frank', 'Undo', '33');
		await helpers.checkinGame(game.title, '33');

		await page.goto(`/management/transactions?gameTitle=${helpers.prefix}_RevCI`);

		const txRow = helpers.tableRow(page, game.title)
			.filter({ hasText: 'Frank Undo' })
			.filter({ has: page.locator('.type-badge.checkin') })
			.first();
		await expect(txRow).toBeVisible();

		await txRow.locator('.btn-reverse').click();

		await expect(page.getByText('Checkin reversed successfully')).toBeVisible();

		const correctionBadge = helpers.tableRow(page, game.title)
			.locator('.correction-badge');
		await expect(correctionBadge.first()).toBeVisible();
	});
});
