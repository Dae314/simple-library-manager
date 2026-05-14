import { test, expect } from './fixtures';

test.describe('Swap Flow', () => {
	test.fixme('full swap flow: open dialog, select game, enter weights, confirm → success toast', async ({
		page,
		helpers
	}) => {
		// Create two games: one to checkout (return game), one to swap to (new game)
		const returnGame = await helpers.createGame(`${helpers.prefix}_SwapReturn`);
		const newGame = await helpers.createGame(`${helpers.prefix}_SwapNew`);

		// Checkout the return game
		await helpers.checkoutGame(returnGame.title, 'Swap', 'Tester', '25.0');

		// Navigate to library filtered to checked-out games
		await page.goto(`/library?search=${encodeURIComponent(returnGame.title)}&status=checked_out`);
		const row = helpers.tableRow(page, returnGame.title).first();
		await expect(row).toBeVisible();

		// Click the Swap button
		await row.getByRole('button', { name: 'Swap' }).click();

		// Verify the swap dialog opens
		const dialog = page.locator('dialog.swap-dialog');
		await expect(dialog).toBeVisible();

		// Verify return game info is displayed
		await expect(dialog.locator('.return-info')).toContainText('Swap Tester');

		// Search for the new game in the available games list
		await dialog.locator('input[aria-label="Search available games"]').fill(newGame.title);

		// Wait for search results and select the new game
		const gameItem = dialog.locator('.game-item', { hasText: newGame.title });
		await expect(gameItem).toBeVisible({ timeout: 5000 });
		await gameItem.click();

		// Verify the game is selected
		await expect(gameItem).toHaveClass(/selected/);

		// Enter weights
		await dialog.locator('#swap-checkinWeight').fill('25.0');
		await dialog.locator('#swap-checkoutWeight').fill('30.0');

		// Confirm the swap - directly trigger the swap via the form's submit event
		await expect(dialog.getByRole('button', { name: 'Confirm Swap' })).toBeEnabled({ timeout: 5_000 });
		
		// Use requestSubmit which properly triggers the submit event including Svelte's handler
		await dialog.locator('form').evaluate(form => {
			(form as HTMLFormElement).requestSubmit();
		});

		// Wait for the swap to complete - dialog should close
		await expect(dialog).not.toBeVisible({ timeout: 15_000 });

		// Verify the return game is now available
		await page.goto(`/library?search=${encodeURIComponent(returnGame.title)}`);
		const returnRow = helpers.tableRow(page, returnGame.title).first();
		await expect(returnRow).toBeVisible();
		await expect(returnRow).not.toContainText('Swap Tester');

		// Verify the new game is now checked out
		await page.goto(`/library?search=${encodeURIComponent(newGame.title)}&status=checked_out`);
		const newRow = helpers.tableRow(page, newGame.title).first();
		await expect(newRow).toBeVisible();
		await expect(newRow).toContainText('Swap Tester');
	});

	test('weight warning displayed when checkin weight differs significantly from checkout weight', async ({
		page,
		helpers
	}) => {
		const returnGame = await helpers.createGame(`${helpers.prefix}_SwapWarn`);
		const newGame = await helpers.createGame(`${helpers.prefix}_SwapWarnNew`);

		// Checkout with weight 32.5
		await helpers.checkoutGame(returnGame.title, 'Weight', 'Warn', '32.5');

		// Open swap dialog
		await page.goto(`/library?search=${encodeURIComponent(returnGame.title)}&status=checked_out`);
		const row = helpers.tableRow(page, returnGame.title).first();
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: 'Swap' }).click();

		const dialog = page.locator('dialog.swap-dialog');
		await expect(dialog).toBeVisible();

		// Enter a checkin weight that differs significantly (30.0 vs 32.5 → difference 2.5 > tolerance 0.5)
		await dialog.locator('#swap-checkinWeight').fill('30.0');

		// Verify the inline weight warning is displayed (red level)
		const weightWarning = dialog.locator('.inline-weight-warning');
		await expect(weightWarning).toBeVisible();
		await expect(weightWarning).toHaveClass(/warning-red/);
		await expect(weightWarning).toContainText('Exceeds Tolerance');

		// Now test yellow warning: enter a weight with minor discrepancy (32.2 vs 32.5 → difference 0.3)
		await dialog.locator('#swap-checkinWeight').fill('32.2');
		await expect(weightWarning).toBeVisible();
		await expect(weightWarning).toHaveClass(/warning-yellow/);
		await expect(weightWarning).toContainText('Minor Weight Discrepancy');
	});

	test('conflict detection: warning shown and submit disabled when another context modifies a game', async ({
		browser,
		helpers
	}) => {
		const returnGame = await helpers.createGame(`${helpers.prefix}_SwapConflict`);
		const newGame = await helpers.createGame(`${helpers.prefix}_SwapConflictNew`);

		// Checkout the return game using a setup context
		const setupContext = await browser.newContext();
		const setupPage = await setupContext.newPage();
		await setupPage.goto(`/library?search=${encodeURIComponent(returnGame.title)}`);
		const setupRow = setupPage.locator('tbody tr', { hasText: returnGame.title }).first();
		await expect(setupRow).toBeVisible();
		await setupRow.getByRole('button', { name: 'Checkout' }).click();
		const setupDialog = setupPage.locator('dialog.checkout-dialog');
		await expect(setupDialog).toBeVisible();
		await setupDialog.locator('#checkout-attendeeFirstName').fill('Conflict');
		await setupDialog.locator('#checkout-attendeeLastName').fill('Test');
		await setupDialog.locator('#checkout-idType').selectOption({ index: 1 });
		await setupDialog.locator('#checkout-checkoutWeight').fill('20.0');
		await setupDialog.getByRole('button', { name: 'Confirm Checkout' }).click();
		await expect(setupPage.getByText('Game checked out successfully!')).toBeVisible();
		await setupContext.close();

		// Context 1: open the swap dialog
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const tab1 = await context1.newPage();
		const tab2 = await context2.newPage();

		try {
			// Tab 1: navigate to library, open swap dialog
			await tab1.goto(
				`/library?search=${encodeURIComponent(returnGame.title)}&status=checked_out`
			);
			await expect(
				tab1.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			const row1 = tab1.locator('tbody tr', { hasText: returnGame.title }).first();
			await expect(row1).toBeVisible();
			await row1.getByRole('button', { name: 'Swap' }).click();

			const swapDialog = tab1.locator('dialog.swap-dialog');
			await expect(swapDialog).toBeVisible();

			// Select the new game
			await swapDialog
				.locator('input[aria-label="Search available games"]')
				.fill(newGame.title);
			const gameItem = swapDialog.locator('.game-item', { hasText: newGame.title });
			await expect(gameItem).toBeVisible({ timeout: 5000 });
			await gameItem.click();

			// Verify no status warning initially
			await expect(swapDialog.locator('.status-warning')).not.toBeVisible();

			// Tab 2: check out the new game from another station (making it unavailable)
			await tab2.goto(`/library?search=${encodeURIComponent(newGame.title)}`);
			await expect(
				tab2.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			const row2 = tab2.locator('tbody tr', { hasText: newGame.title }).first();
			await expect(row2).toBeVisible();
			await row2.getByRole('button', { name: 'Checkout' }).click();

			const checkoutDialog = tab2.locator('dialog.checkout-dialog');
			await expect(checkoutDialog).toBeVisible();
			await checkoutDialog.locator('#checkout-attendeeFirstName').fill('Other');
			await checkoutDialog.locator('#checkout-attendeeLastName').fill('User');
			await checkoutDialog.locator('#checkout-idType').selectOption({ index: 1 });
			await checkoutDialog.locator('#checkout-checkoutWeight').fill('15.0');
			await checkoutDialog.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(tab2.getByText('Game checked out successfully!')).toBeVisible();

			// Verify tab 1's swap dialog shows the status change warning
			await expect(swapDialog.locator('.status-warning')).toBeVisible({ timeout: 10_000 });

			// Verify the submit button is disabled
			await expect(
				swapDialog.getByRole('button', { name: 'Confirm Swap' })
			).toBeDisabled();
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
