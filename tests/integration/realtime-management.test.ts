import { test, expect } from './fixtures';

test.describe('Real-Time: Management Changes Propagate', () => {
	test('new game created on management page appears on library without refresh', async ({ browser, helpers }) => {
		const title = `${helpers.prefix}_RTNewGame`;

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: management games page (where we'll create the game)
			await tab1.goto('/management/games');
			// Tab 2: library page (where we'll observe the change)
			await tab2.goto(`/library?search=${encodeURIComponent(title)}`);

			// Wait for WebSocket connections
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			// Verify the game does NOT exist on the library yet
			await expect(tab2.locator('tbody tr', { hasText: title })).not.toBeVisible();

			// Create a new game via the management UI on tab 1
			await tab1.click('a[href="/management/games/new"]');
			await expect(tab1).toHaveURL(/\/management\/games\/new/);
			await tab1.fill('#title', title);
			await tab1.fill('#bggId', '36218');
			await tab1.selectOption('#gameType', 'standard');
			await tab1.click('button:has-text("Add Game")');

			// Wait for redirect back to management games list
			await expect(tab1).toHaveURL(/\/management\/games$/, { timeout: 10_000 });

			// Verify the new game appears on tab 2's library without manual refresh
			await expect(
				tab2.locator('tbody tr', { hasText: title }).first()
			).toBeVisible({ timeout: 10_000 });
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('game title edit on management page propagates to library', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTEdit`);
		const newTitle = `${helpers.prefix}_RTEdited`;

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 2: library page showing the game
			await tab2.goto(`/library?search=${encodeURIComponent(helpers.prefix)}`);
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });
			await expect(tab2.locator('tbody tr', { hasText: game.title }).first()).toBeVisible();

			// Tab 1: navigate to the game's edit page
			await tab1.goto(`/management/games?search=${encodeURIComponent(game.title)}`);
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			const row = tab1.locator('tbody tr', { hasText: game.title });
			await row.locator('a', { hasText: 'Edit' }).click();
			await expect(tab1).toHaveURL(/\/management\/games\/\d+/);

			// Edit the game title
			await tab1.locator('#title').fill(newTitle);
			await tab1.click('button:has-text("Save Changes")');
			await expect(tab1).toHaveURL(/\/management\/games$/, { timeout: 10_000 });

			// Verify the updated title appears on tab 2 without manual refresh
			// The old title should disappear and the new title should appear
			await expect(
				tab2.locator('tbody tr', { hasText: newTitle }).first()
			).toBeVisible({ timeout: 10_000 });
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
