import { test, expect } from './fixtures';

test.describe('Real-Time: Form Preservation During Live Updates', () => {
	test('checkout dialog inputs survive when another station checks out a different game', async ({
		browser,
		helpers
	}) => {
		// Create two games — one for the librarian to select, one for the other station to check out
		const gameA = await helpers.createGame(`${helpers.prefix}_FormKeepA`);
		const gameB = await helpers.createGame(`${helpers.prefix}_FormKeepB`);

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const librarian = await context1.newPage();
		const otherStation = await context2.newPage();

		try {
			// Librarian navigates to library and waits for WebSocket
			await librarian.goto(`/library?search=${encodeURIComponent(helpers.prefix)}`);
			await expect(
				librarian.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			// Librarian selects game A and opens the checkout dialog
			const rowA = librarian.locator('tbody tr', { hasText: gameA.title }).first();
			await expect(rowA).toBeVisible();
			await rowA.getByRole('button', { name: 'Checkout' }).click();

			const dialog = librarian.locator('dialog.checkout-dialog');
			await expect(dialog).toBeVisible();
			await dialog.locator('#checkout-attendeeFirstName').fill('Alice');
			await dialog.locator('#checkout-attendeeLastName').fill('InProgress');
			await dialog.locator('#checkout-idType').selectOption({ index: 1 });
			await dialog.locator('#checkout-checkoutWeight').fill('22.5');

			// Other station checks out game B (triggers a WebSocket event to librarian)
			await otherStation.goto(`/library?search=${encodeURIComponent(gameB.title)}`);
			const rowB = otherStation.locator('tbody tr', { hasText: gameB.title }).first();
			await expect(rowB).toBeVisible();
			await rowB.getByRole('button', { name: 'Checkout' }).click();

			const otherDialog = otherStation.locator('dialog.checkout-dialog');
			await expect(otherDialog).toBeVisible();
			await otherDialog.locator('#checkout-attendeeFirstName').fill('Bob');
			await otherDialog.locator('#checkout-attendeeLastName').fill('Other');
			await otherDialog.locator('#checkout-idType').selectOption({ index: 1 });
			await otherDialog.locator('#checkout-checkoutWeight').fill('30.0');
			await otherDialog.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(otherStation.getByText('Game checked out successfully!')).toBeVisible();

			// Wait for the real-time update to propagate to the librarian's tab
			// Game B's status should change to checked out (action button changes)
			await expect(
				librarian.locator('tbody tr', { hasText: gameB.title }).first().getByRole('button', { name: 'Check In' })
			).toBeVisible({ timeout: 10_000 });

			// Verify the librarian's dialog is still visible and inputs are preserved
			await expect(dialog).toBeVisible();
			await expect(dialog.locator('#checkout-attendeeFirstName')).toHaveValue('Alice');
			await expect(dialog.locator('#checkout-attendeeLastName')).toHaveValue('InProgress');
			await expect(dialog.locator('#checkout-checkoutWeight')).toHaveValue('22.5');

			// Verify game A is still visible in the table
			await expect(
				librarian.locator('tbody tr', { hasText: gameA.title }).first()
			).toBeVisible();

			// Verify the librarian can still successfully submit the checkout
			await dialog.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(librarian.getByText('Game checked out successfully!')).toBeVisible();
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('checkout dialog stays on the correct game when list updates', async ({
		browser,
		helpers
	}) => {
		// Create three games to ensure the list has multiple items that could shift
		const gameA = await helpers.createGame(`${helpers.prefix}_StableA`);
		const gameB = await helpers.createGame(`${helpers.prefix}_StableB`);
		const gameC = await helpers.createGame(`${helpers.prefix}_StableC`);

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const librarian = await context1.newPage();
		const otherStation = await context2.newPage();

		try {
			// Librarian navigates to library, searches for the prefix to see all three
			await librarian.goto(`/library?search=${encodeURIComponent(helpers.prefix)}`);
			await expect(
				librarian.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			// Verify all three games are visible
			await expect(librarian.locator('tbody tr', { hasText: gameA.title }).first()).toBeVisible();
			await expect(librarian.locator('tbody tr', { hasText: gameB.title }).first()).toBeVisible();
			await expect(librarian.locator('tbody tr', { hasText: gameC.title }).first()).toBeVisible();

			// Librarian selects game B (the middle one) and opens checkout dialog
			const rowB = librarian.locator('tbody tr', { hasText: gameB.title }).first();
			await rowB.getByRole('button', { name: 'Checkout' }).click();

			const dialog = librarian.locator('dialog.checkout-dialog');
			await expect(dialog).toBeVisible();
			await expect(dialog.locator('h2')).toContainText(gameB.title);

			// Other station checks out game A (triggers list update on librarian's tab)
			await otherStation.goto(`/library?search=${encodeURIComponent(gameA.title)}`);
			const otherRow = otherStation.locator('tbody tr', { hasText: gameA.title }).first();
			await expect(otherRow).toBeVisible();
			await otherRow.getByRole('button', { name: 'Checkout' }).click();

			const otherDialog = otherStation.locator('dialog.checkout-dialog');
			await expect(otherDialog).toBeVisible();
			await otherDialog.locator('#checkout-attendeeFirstName').fill('Other');
			await otherDialog.locator('#checkout-attendeeLastName').fill('Station');
			await otherDialog.locator('#checkout-idType').selectOption({ index: 1 });
			await otherDialog.locator('#checkout-checkoutWeight').fill('20.0');
			await otherDialog.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(otherStation.getByText('Game checked out successfully!')).toBeVisible();

			// Wait for game A's status to change on librarian's tab (action button changes)
			await expect(
				librarian.locator('tbody tr', { hasText: gameA.title }).first().getByRole('button', { name: 'Check In' })
			).toBeVisible({ timeout: 10_000 });

			// Verify the dialog still shows game B (not shifted to game C or lost)
			await expect(dialog).toBeVisible();
			await expect(dialog.locator('h2')).toContainText(gameB.title);
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('checkin dialog inputs survive when another station checks in a different game', async ({
		browser,
		helpers
	}) => {
		// Create and check out two games
		const gameA = await helpers.createGame(`${helpers.prefix}_CIKeepA`);
		const gameB = await helpers.createGame(`${helpers.prefix}_CIKeepB`);

		// Check out both games via a setup page
		const setupCtx = await browser.newContext();
		const setupPage = await setupCtx.newPage();

		for (const game of [gameA, gameB]) {
			await setupPage.goto(`/library?search=${encodeURIComponent(game.title)}`);
			const row = setupPage.locator('tbody tr', { hasText: game.title }).first();
			await expect(row).toBeVisible();
			await row.getByRole('button', { name: 'Checkout' }).click();
			const dialog = setupPage.locator('dialog.checkout-dialog');
			await expect(dialog).toBeVisible();
			await dialog.locator('#checkout-attendeeFirstName').fill('Setup');
			await dialog.locator('#checkout-attendeeLastName').fill('User');
			await dialog.locator('#checkout-idType').selectOption({ index: 1 });
			await dialog.locator('#checkout-checkoutWeight').fill('25.0');
			await dialog.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(setupPage.getByText('Game checked out successfully!')).toBeVisible();
		}
		await setupCtx.close();

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const librarian = await context1.newPage();
		const otherStation = await context2.newPage();

		try {
			// Librarian navigates to library filtered to checked-out games
			await librarian.goto(`/library?status=checked_out&search=${encodeURIComponent(helpers.prefix)}`);
			await expect(
				librarian.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			// Librarian selects game A and opens the checkin dialog
			const rowA = librarian.locator('tbody tr', { hasText: gameA.title }).first();
			await expect(rowA).toBeVisible();
			await rowA.getByRole('button', { name: 'Check In' }).click();

			const dialog = librarian.locator('dialog.checkin-dialog');
			await expect(dialog).toBeVisible();
			await dialog.locator('#checkin-checkinWeight').fill('24.8');

			// Other station checks in game B
			await otherStation.goto(`/library?status=checked_out&search=${encodeURIComponent(gameB.title)}`);
			const otherRow = otherStation.locator('tbody tr', { hasText: gameB.title }).first();
			await expect(otherRow).toBeVisible();
			await otherRow.getByRole('button', { name: 'Check In' }).click();

			const otherDialog = otherStation.locator('dialog.checkin-dialog');
			await expect(otherDialog).toBeVisible();
			await otherDialog.locator('#checkin-checkinWeight').fill('25.0');
			await otherDialog.getByRole('button', { name: 'Confirm Check In' }).click();
			await expect(otherStation.getByText('Game checked in successfully!')).toBeVisible();

			// Wait for game B to disappear from librarian's checked-out filtered view
			await expect(
				librarian.locator('tbody tr', { hasText: gameB.title })
			).not.toBeVisible({ timeout: 10_000 });

			// Verify the librarian's dialog is still visible with preserved input
			await expect(dialog).toBeVisible();
			await expect(dialog.locator('#checkin-checkinWeight')).toHaveValue('24.8');
			await expect(dialog.locator('h2')).toContainText(gameA.title);

			// Verify the librarian can still successfully submit the checkin
			await dialog.getByRole('button', { name: 'Confirm Check In' }).click();
			await expect(librarian.getByText('Game checked in successfully!')).toBeVisible();
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
