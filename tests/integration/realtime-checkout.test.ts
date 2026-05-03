import { test, expect } from './fixtures';

test.describe('Real-Time: Checkout Broadcasting', () => {
	test('WebSocket connection indicator shows live on library page', async ({ page, helpers }) => {
		await page.goto('/library');

		const indicator = page.locator('.connection-indicator');
		await expect(indicator).toBeVisible();

		// Wait for WebSocket to connect (green dot)
		const dot = indicator.locator('.dot.connected');
		await expect(dot).toBeVisible({ timeout: 10_000 });

		// Verify screen-reader text
		await expect(indicator.locator('.sr-only')).toHaveText('Live updates active');
	});

	test('checkout on one tab is reflected on another tab without refresh', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTCheckout`);

		// Open two separate browser contexts to simulate two tabs/stations
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Navigate both tabs to the library page with the game visible
			await tab1.goto(`/library?search=${encodeURIComponent(game.title)}`);
			await tab2.goto(`/library?search=${encodeURIComponent(game.title)}`);

			// Wait for WebSocket connections on both tabs
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			// Verify the game is visible on both tabs
			const row1 = tab1.locator('tbody tr', { hasText: game.title }).first();
			const row2 = tab2.locator('tbody tr', { hasText: game.title }).first();
			await expect(row1).toBeVisible();
			await expect(row2).toBeVisible();

			// Check out the game on tab 1 via the dialog
			await row1.getByRole('button', { name: 'Checkout' }).click();

			const checkoutDialog = tab1.locator('dialog.checkout-dialog');
			await expect(checkoutDialog).toBeVisible();
			await checkoutDialog.locator('#checkout-attendeeFirstName').fill('Alice');
			await checkoutDialog.locator('#checkout-attendeeLastName').fill('Tester');
			await checkoutDialog.locator('#checkout-idType').selectOption({ index: 1 });
			await checkoutDialog.locator('#checkout-checkoutWeight').fill('25.0');
			await checkoutDialog.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(tab1.getByText('Game checked out successfully!')).toBeVisible();

			// Verify tab 2 automatically reflects the change
			// The game status should update (it's now checked out, so the action button changes)
			await expect(
				tab2.locator('tbody tr', { hasText: game.title }).first().getByRole('button', { name: 'Check In' })
			).toBeVisible({ timeout: 10_000 });
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
