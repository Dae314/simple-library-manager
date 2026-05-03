import { test, expect } from './fixtures';

test.describe('Real-Time: Checkin Broadcasting', () => {
	test('checkin on one tab is reflected on another tab without refresh', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTCheckin`);

		// Check out the game first via the UI using a temporary page
		const setupContext = await browser.newContext();
		const setupPage = await setupContext.newPage();
		await setupPage.goto(`/library?search=${encodeURIComponent(game.title)}`);
		const setupRow = setupPage.locator('tbody tr', { hasText: game.title }).first();
		await expect(setupRow).toBeVisible();
		await setupRow.getByRole('button', { name: 'Checkout' }).click();
		const setupDialog = setupPage.locator('dialog.checkout-dialog');
		await expect(setupDialog).toBeVisible();
		await setupDialog.locator('#checkout-attendeeFirstName').fill('Bob');
		await setupDialog.locator('#checkout-attendeeLastName').fill('Setup');
		await setupDialog.locator('#checkout-idType').selectOption({ index: 1 });
		await setupDialog.locator('#checkout-checkoutWeight').fill('30.0');
		await setupDialog.getByRole('button', { name: 'Confirm Checkout' }).click();
		await expect(setupPage.getByText('Game checked out successfully!')).toBeVisible();
		await setupContext.close();

		// Open two separate browser contexts on the library page filtered to checked-out games
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			await tab1.goto(`/library?status=checked_out&search=${encodeURIComponent(game.title)}`);
			await tab2.goto(`/library?status=checked_out&search=${encodeURIComponent(game.title)}`);

			// Wait for WebSocket connections
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			// Verify the game is visible on both tabs (it's checked out)
			const row1 = tab1.locator('tbody tr', { hasText: game.title }).first();
			const row2 = tab2.locator('tbody tr', { hasText: game.title }).first();
			await expect(row1).toBeVisible();
			await expect(row2).toBeVisible();

			// Check in the game on tab 1 via the dialog
			await row1.getByRole('button', { name: 'Check In' }).click();
			const checkinDialog = tab1.locator('dialog.checkin-dialog');
			await expect(checkinDialog).toBeVisible();
			await checkinDialog.locator('#checkin-checkinWeight').fill('30.0');
			await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();
			await expect(tab1.getByText('Game checked in successfully!')).toBeVisible();

			// Verify tab 2 automatically reflects the game as no longer checked out
			// The game should disappear from the checked-out filtered view
			await expect(
				tab2.locator('tbody tr', { hasText: game.title })
			).not.toBeVisible({ timeout: 10_000 });
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
