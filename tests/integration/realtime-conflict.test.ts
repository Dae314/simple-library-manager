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
			await expect(tab2).toHaveURL(/\/management\/games$/, { timeout: 10_000 });

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
			await expect(tab2).toHaveURL(/\/management\/games$/, { timeout: 10_000 });

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
			await expect(tab2).toHaveURL(/\/management\/games$/, { timeout: 10_000 });

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

	test('Status_Change_Warning appears in checkout dialog when game is checked out by another station', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTDialogConflict`);

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: navigate to library and open checkout dialog for the game
			await tab1.goto(`/library?search=${encodeURIComponent(game.title)}`);
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			const row1 = tab1.locator('tbody tr', { hasText: game.title }).first();
			await expect(row1).toBeVisible();
			await row1.getByRole('button', { name: 'Checkout' }).click();

			const dialog1 = tab1.locator('dialog.checkout-dialog');
			await expect(dialog1).toBeVisible();

			// Verify no status warning initially
			await expect(dialog1.locator('.status-warning')).not.toBeVisible();

			// Tab 2: check out the same game from another station
			await tab2.goto(`/library?search=${encodeURIComponent(game.title)}`);
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			const row2 = tab2.locator('tbody tr', { hasText: game.title }).first();
			await expect(row2).toBeVisible();
			await row2.getByRole('button', { name: 'Checkout' }).click();

			const dialog2 = tab2.locator('dialog.checkout-dialog');
			await expect(dialog2).toBeVisible();
			await dialog2.locator('#checkout-attendeeFirstName').fill('Other');
			await dialog2.locator('#checkout-attendeeLastName').fill('Station');
			await dialog2.locator('#checkout-idType').selectOption({ index: 1 });
			await dialog2.locator('#checkout-checkoutWeight').fill('20.0');
			await dialog2.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(tab2.getByText('Game checked out successfully!')).toBeVisible();

			// Verify tab 1's dialog shows the status change warning
			await expect(dialog1.locator('.status-warning')).toBeVisible({ timeout: 10_000 });

			// Verify the submit button is disabled
			await expect(dialog1.getByRole('button', { name: 'Confirm Checkout' })).toBeDisabled();
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('Status_Change_Warning appears in checkin dialog when game is checked in by another station', async ({ browser, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RTCheckinConflict`);

		// Check out the game first
		const setupContext = await browser.newContext();
		const setupPage = await setupContext.newPage();
		await setupPage.goto(`/library?search=${encodeURIComponent(game.title)}`);
		const setupRow = setupPage.locator('tbody tr', { hasText: game.title }).first();
		await expect(setupRow).toBeVisible();
		await setupRow.getByRole('button', { name: 'Checkout' }).click();
		const setupDialog = setupPage.locator('dialog.checkout-dialog');
		await expect(setupDialog).toBeVisible();
		await setupDialog.locator('#checkout-attendeeFirstName').fill('Setup');
		await setupDialog.locator('#checkout-attendeeLastName').fill('User');
		await setupDialog.locator('#checkout-idType').selectOption({ index: 1 });
		await setupDialog.locator('#checkout-checkoutWeight').fill('25.0');
		await setupDialog.getByRole('button', { name: 'Confirm Checkout' }).click();
		await expect(setupPage.getByText('Game checked out successfully!')).toBeVisible();
		await setupContext.close();

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: navigate to library filtered to checked-out, open checkin dialog
			await tab1.goto(`/library?status=checked_out&search=${encodeURIComponent(game.title)}`);
			await expect(tab1.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			const row1 = tab1.locator('tbody tr', { hasText: game.title }).first();
			await expect(row1).toBeVisible();
			await row1.getByRole('button', { name: 'Check In' }).click();

			const dialog1 = tab1.locator('dialog.checkin-dialog');
			await expect(dialog1).toBeVisible();

			// Verify no status warning initially
			await expect(dialog1.locator('.status-warning')).not.toBeVisible();

			// Tab 2: check in the same game from another station
			await tab2.goto(`/library?status=checked_out&search=${encodeURIComponent(game.title)}`);
			await expect(tab2.locator('.connection-indicator .dot.connected')).toBeVisible({ timeout: 10_000 });

			const row2 = tab2.locator('tbody tr', { hasText: game.title }).first();
			await expect(row2).toBeVisible();
			await row2.getByRole('button', { name: 'Check In' }).click();

			const dialog2 = tab2.locator('dialog.checkin-dialog');
			await expect(dialog2).toBeVisible();
			await dialog2.locator('#checkin-checkinWeight').fill('25.0');
			await dialog2.getByRole('button', { name: 'Confirm Check In' }).click();
			await expect(tab2.getByText('Game checked in successfully!')).toBeVisible();

			// Verify tab 1's dialog shows the status change warning
			await expect(dialog1.locator('.status-warning')).toBeVisible({ timeout: 10_000 });

			// Verify the submit button is disabled
			await expect(dialog1.getByRole('button', { name: 'Confirm Check In' })).toBeDisabled();
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
