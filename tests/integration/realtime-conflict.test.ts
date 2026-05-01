import { test, expect } from './fixtures';

test.describe('Real-Time: Edit Page Conflict Warning', () => {
	test('conflict warning appears when another station modifies the same game', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTConflict`);

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: open the game edit page
			await tab1.goto(`/management/games/${game.id}`);
			await expect(tab1.locator('h1')).toContainText('Edit Game');
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			// Verify no conflict warning initially
			await expect(tab1.locator('.conflict-warning')).not.toBeVisible();

			// Tab 2: also open the same game edit page and modify it
			await tab2.goto(`/management/games/${game.id}`);
			await expect(tab2.locator('h1')).toContainText('Edit Game');
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			// Edit the game title on tab 2 and save
			await tab2.locator('#title').fill(`${helpers.prefix}_RTConflict_Modified`);
			await tab2.click('button:has-text("Save Changes")');
			await expect(tab2).toHaveURL(/\/management$/, { timeout: 10_000 });

			// Verify tab 1 displays the conflict warning banner
			const conflictWarning = tab1.locator('.conflict-warning');
			await expect(conflictWarning).toBeVisible({ timeout: 10_000 });
			await expect(conflictWarning).toContainText('This game was modified by another station');
			await expect(conflictWarning).toContainText('Your form data may be stale');
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('Reload button refreshes the form data', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTReload`);

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: open the game edit page
			await tab1.goto(`/management/games/${game.id}`);
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			// Tab 2: modify the game
			await tab2.goto(`/management/games/${game.id}`);
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			const modifiedTitle = `${helpers.prefix}_RTReload_Updated`;
			await tab2.locator('#title').fill(modifiedTitle);
			await tab2.click('button:has-text("Save Changes")');
			await expect(tab2).toHaveURL(/\/management$/, { timeout: 10_000 });

			// Wait for conflict warning on tab 1
			const conflictWarning = tab1.locator('.conflict-warning');
			await expect(conflictWarning).toBeVisible({ timeout: 10_000 });

			// Click the Reload button
			await tab1.locator('.btn-reload').click();

			// Conflict warning should disappear
			await expect(conflictWarning).not.toBeVisible();

			// The form should now show the updated title
			await expect(tab1.locator('#title')).toHaveValue(modifiedTitle);
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('Dismiss button hides the warning without reloading', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTDismiss`);

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: open the game edit page and type something in the title
			await tab1.goto(`/management/games/${game.id}`);
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			// Type a local change that we want to preserve
			const localEdit = `${helpers.prefix}_RTDismiss_LocalEdit`;
			await tab1.locator('#title').fill(localEdit);

			// Tab 2: modify the game to trigger conflict
			await tab2.goto(`/management/games/${game.id}`);
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });
			await tab2.locator('#title').fill(`${helpers.prefix}_RTDismiss_Remote`);
			await tab2.click('button:has-text("Save Changes")');
			await expect(tab2).toHaveURL(/\/management$/, { timeout: 10_000 });

			// Wait for conflict warning on tab 1
			const conflictWarning = tab1.locator('.conflict-warning');
			await expect(conflictWarning).toBeVisible({ timeout: 10_000 });

			// Click the Dismiss button
			await tab1.locator('.btn-dismiss').click();

			// Conflict warning should disappear
			await expect(conflictWarning).not.toBeVisible();

			// The local edit should still be in the form (not reloaded)
			await expect(tab1.locator('#title')).toHaveValue(localEdit);
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
