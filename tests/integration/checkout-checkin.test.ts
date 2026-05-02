import { test, expect } from './fixtures';

test.describe('Checkout → Checkin Flow', () => {
	test('happy path: checkout a game, then check it back in', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_HappyPath`);

		// --- Checkout ---
		await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
		const row = helpers.tableRow(page, game.title).first();
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: 'Checkout' }).click();

		const checkoutForm = page.locator('section[aria-label="Checkout form"]');
		await expect(checkoutForm).toBeVisible();

		await checkoutForm.locator('#attendeeFirstName').fill('Jane');
		await checkoutForm.locator('#attendeeLastName').fill('Doe');
		await checkoutForm.locator('#idType').selectOption({ index: 1 });
		await checkoutForm.locator('#checkoutWeight').fill('32.5');
		await checkoutForm.getByRole('button', { name: 'Confirm Checkout' }).click();

		await expect(page.getByText('Game checked out successfully!')).toBeVisible();

		// --- Checkin ---
		await page.goto('/checkin');
		const checkinRow = helpers.tableRow(page, game.title).first();
		await expect(checkinRow).toBeVisible();
		await expect(checkinRow).toContainText('Jane Doe');

		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		const idReminder = checkinForm.locator('.id-reminder');
		await expect(idReminder).toBeVisible();
		await expect(idReminder).toContainText('Jane Doe');

		await checkinForm.locator('#checkinWeight').fill('32.5');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Verify the game is back as available
		await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
		await expect(
			helpers.tableRow(page, game.title).first()
		).toBeVisible();
	});

	test('weight warning is displayed when checkin weight differs beyond tolerance', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_WeightWarn`);

		// Checkout with weight 32.5
		await helpers.checkoutGame(game.title, 'Bob', 'Smith', '32.5');

		// Checkin with weight 30.0 (difference 2.5 > tolerance 0.5)
		await page.goto('/checkin');
		const checkinRow = helpers.tableRow(page, game.title).first();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		await checkinForm.locator('#checkinWeight').fill('30.0');

		// Warning should appear inline while entering weight, before submission
		const weightWarning = checkinForm.locator('.inline-weight-warning');
		await expect(weightWarning).toBeVisible();
		await expect(weightWarning).toContainText('Weight Discrepancy');

		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('validation errors appear when submitting checkout without required fields', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_Validate`);

		await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
		const row = helpers.tableRow(page, game.title).first();
		await row.getByRole('button', { name: 'Checkout' }).click();

		const checkoutForm = page.locator('section[aria-label="Checkout form"]');
		await expect(checkoutForm).toBeVisible();

		// Submit empty form
		await checkoutForm.locator('#attendeeFirstName').fill('');
		await checkoutForm.locator('#attendeeLastName').fill('');
		await checkoutForm.getByRole('button', { name: 'Confirm Checkout' }).click();

		await expect(checkoutForm.locator('.field-error').first()).toBeVisible();
	});
});
