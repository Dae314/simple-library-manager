import { test, expect } from './fixtures';

test.describe('Real-Time: Form Preservation During Live Updates', () => {
	test('checkout form inputs survive when another station checks out a different game', async ({
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
			// Librarian navigates to checkout and waits for WebSocket
			await librarian.goto('/checkout');
			await expect(
				librarian.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			// Librarian selects game A and starts filling the form
			const cardA = librarian.locator('.game-card', { hasText: gameA.title }).first();
			await expect(cardA).toBeVisible();
			await cardA.getByRole('button', { name: 'Checkout' }).click();

			const form = librarian.locator('section[aria-label="Checkout form"]');
			await expect(form).toBeVisible();
			await form.locator('#attendeeFirstName').fill('Alice');
			await form.locator('#attendeeLastName').fill('InProgress');
			await form.locator('#idType').selectOption({ index: 1 });
			await form.locator('#checkoutWeight').fill('22.5');

			// Other station checks out game B (triggers a WebSocket event to librarian)
			await otherStation.goto(`/checkout?search=${encodeURIComponent(gameB.title)}`);
			const cardB = otherStation.locator('.game-card', { hasText: gameB.title }).first();
			await expect(cardB).toBeVisible();
			await cardB.getByRole('button', { name: 'Checkout' }).click();

			const otherForm = otherStation.locator('section[aria-label="Checkout form"]');
			await expect(otherForm).toBeVisible();
			await otherForm.locator('#attendeeFirstName').fill('Bob');
			await otherForm.locator('#attendeeLastName').fill('Other');
			await otherForm.locator('#idType').selectOption({ index: 1 });
			await otherForm.locator('#checkoutWeight').fill('30.0');
			await otherForm.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(otherStation.getByText('Game checked out successfully!')).toBeVisible();

			// Wait for the real-time update to propagate to the librarian's tab
			// Game B should disappear from the librarian's game list
			await expect(
				librarian.locator('.game-card', { hasText: gameB.title })
			).not.toBeVisible({ timeout: 10_000 });

			// Verify the librarian's form is still visible and inputs are preserved
			await expect(form).toBeVisible();
			await expect(form.locator('#attendeeFirstName')).toHaveValue('Alice');
			await expect(form.locator('#attendeeLastName')).toHaveValue('InProgress');
			await expect(form.locator('#checkoutWeight')).toHaveValue('22.5');

			// Verify game A is still selected (card still highlighted)
			await expect(
				librarian.locator('.game-card', { hasText: gameA.title }).first()
			).toBeVisible();

			// Verify the librarian can still successfully submit the checkout
			await form.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(librarian.getByText('Game checked out successfully!')).toBeVisible();
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('checkout selection stays on the correct game when list updates', async ({
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
			// Librarian navigates to checkout, searches for the prefix to see all three
			await librarian.goto(`/checkout?search=${encodeURIComponent(helpers.prefix)}`);
			await expect(
				librarian.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			// Verify all three games are visible
			await expect(librarian.locator('.game-card', { hasText: gameA.title }).first()).toBeVisible();
			await expect(librarian.locator('.game-card', { hasText: gameB.title }).first()).toBeVisible();
			await expect(librarian.locator('.game-card', { hasText: gameC.title }).first()).toBeVisible();

			// Librarian selects game B (the middle one)
			const cardB = librarian.locator('.game-card', { hasText: gameB.title }).first();
			await cardB.getByRole('button', { name: 'Checkout' }).click();

			const form = librarian.locator('section[aria-label="Checkout form"]');
			await expect(form).toBeVisible();
			await expect(form.locator('h2')).toContainText(gameB.title);

			// Other station checks out game A (triggers list update on librarian's tab)
			await otherStation.goto(`/checkout?search=${encodeURIComponent(gameA.title)}`);
			const otherCard = otherStation.locator('.game-card', { hasText: gameA.title }).first();
			await expect(otherCard).toBeVisible();
			await otherCard.getByRole('button', { name: 'Checkout' }).click();

			const otherForm = otherStation.locator('section[aria-label="Checkout form"]');
			await expect(otherForm).toBeVisible();
			await otherForm.locator('#attendeeFirstName').fill('Other');
			await otherForm.locator('#attendeeLastName').fill('Station');
			await otherForm.locator('#idType').selectOption({ index: 1 });
			await otherForm.locator('#checkoutWeight').fill('20.0');
			await otherForm.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(otherStation.getByText('Game checked out successfully!')).toBeVisible();

			// Wait for game A to disappear from librarian's list
			await expect(
				librarian.locator('.game-card', { hasText: gameA.title })
			).not.toBeVisible({ timeout: 10_000 });

			// Verify the form still shows game B (not shifted to game C or lost)
			await expect(form).toBeVisible();
			await expect(form.locator('h2')).toContainText(gameB.title);

			// Game B's checkout button should still be disabled (it's the selected game)
			await expect(
				librarian.locator('.game-card', { hasText: gameB.title }).first().getByRole('button', { name: 'Checkout' })
			).toBeDisabled();
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('checkin form inputs survive when another station checks in a different game', async ({
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
			await setupPage.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
			const card = setupPage.locator('.game-card', { hasText: game.title }).first();
			await expect(card).toBeVisible();
			await card.getByRole('button', { name: 'Checkout' }).click();
			const form = setupPage.locator('section[aria-label="Checkout form"]');
			await expect(form).toBeVisible();
			await form.locator('#attendeeFirstName').fill('Setup');
			await form.locator('#attendeeLastName').fill('User');
			await form.locator('#idType').selectOption({ index: 1 });
			await form.locator('#checkoutWeight').fill('25.0');
			await form.getByRole('button', { name: 'Confirm Checkout' }).click();
			await expect(setupPage.getByText('Game checked out successfully!')).toBeVisible();
		}
		await setupCtx.close();

		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const librarian = await context1.newPage();
		const otherStation = await context2.newPage();

		try {
			// Librarian navigates to checkin
			await librarian.goto('/checkin');
			await expect(
				librarian.locator('.connection-indicator .dot.connected')
			).toBeVisible({ timeout: 10_000 });

			// Librarian selects game A and starts filling the checkin form
			const cardA = librarian.locator('.game-card', { hasText: gameA.title }).first();
			await expect(cardA).toBeVisible();
			await cardA.getByRole('button', { name: 'Check In' }).click();

			const form = librarian.locator('section[aria-label="Check in form"]');
			await expect(form).toBeVisible();
			await form.locator('#checkinWeight').fill('24.8');

			// Other station checks in game B
			await otherStation.goto('/checkin');
			const otherCard = otherStation.locator('.game-card', { hasText: gameB.title }).first();
			await expect(otherCard).toBeVisible();
			await otherCard.getByRole('button', { name: 'Check In' }).click();

			const otherForm = otherStation.locator('section[aria-label="Check in form"]');
			await expect(otherForm).toBeVisible();
			await otherForm.locator('#checkinWeight').fill('25.0');
			await otherForm.getByRole('button', { name: 'Confirm Check In' }).click();
			await expect(otherStation.getByText('Game checked in successfully!')).toBeVisible();

			// Wait for game B to disappear from librarian's checkin list
			await expect(
				librarian.locator('.game-card', { hasText: gameB.title })
			).not.toBeVisible({ timeout: 10_000 });

			// Verify the librarian's form is still visible with preserved input
			await expect(form).toBeVisible();
			await expect(form.locator('#checkinWeight')).toHaveValue('24.8');
			await expect(form.locator('h2')).toContainText(gameA.title);

			// Verify the librarian can still successfully submit the checkin
			await form.getByRole('button', { name: 'Confirm Check In' }).click();
			await expect(librarian.getByText('Game checked in successfully!')).toBeVisible();
		} finally {
			await context1.close();
			await context2.close();
		}
	});
});
