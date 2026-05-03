import { test, expect } from './fixtures';

test.describe('Real-Time: Static Pages Do Not React', () => {
	test('statistics page does not show connection indicator', async ({ page }) => {
		await page.goto('/management/statistics');

		// Static pages should NOT have a connection indicator
		await expect(page.locator('.connection-indicator')).not.toBeVisible();
	});

	test('statistics page content does not change when events occur', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTStatic`);

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: open the statistics page
			await tab1.goto('/management/statistics');

			// Capture the initial page content (text snapshot)
			const initialContent = await tab1.locator('main').textContent();

			// Verify no connection indicator on the static page
			await expect(tab1.locator('.connection-indicator')).not.toBeVisible();

			// Tab 2: perform a checkout on the library page to generate events
			await tab2.goto(`/library?search=${encodeURIComponent(game.title)}`);
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			const row = tab2.locator('tbody tr', { hasText: game.title }).first();
			await expect(row).toBeVisible();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const checkoutDialog = tab2.locator('dialog.checkout-dialog');
			await expect(checkoutDialog).toBeVisible();
			await checkoutDialog.locator('#checkout-attendeeFirstName').fill('Static');
			await checkoutDialog.locator('#checkout-attendeeLastName').fill('Test');
			await checkoutDialog.locator('#checkout-idType').selectOption({ index: 1 });
			await checkoutDialog.locator('#checkout-checkoutWeight').fill('20.0');
			await checkoutDialog.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(tab2.getByText('Game checked out successfully!')).toBeVisible();

			// Wait a moment for any potential (unwanted) updates to propagate
			await tab1.waitForTimeout(2000);

			// Verify the statistics page content has NOT changed
			const afterContent = await tab1.locator('main').textContent();
			expect(afterContent).toBe(initialContent);

			// Still no connection indicator
			await expect(tab1.locator('.connection-indicator')).not.toBeVisible();
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
