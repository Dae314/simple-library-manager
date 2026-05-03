import { test, expect } from './fixtures';

test.describe('Checkout → Checkin Flow', () => {
	test('happy path: checkout a game, then check it back in', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_HappyPath`);

		// --- Checkout ---
		await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
		const row = helpers.tableRow(page, game.title).first();
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: 'Checkout' }).click();

		const checkoutDialog = page.locator('dialog.checkout-dialog');
		await expect(checkoutDialog).toBeVisible();

		await checkoutDialog.locator('#checkout-attendeeFirstName').fill('Jane');
		await checkoutDialog.locator('#checkout-attendeeLastName').fill('Doe');
		await checkoutDialog.locator('#checkout-idType').selectOption({ index: 1 });
		await checkoutDialog.locator('#checkout-checkoutWeight').fill('32.5');
		await checkoutDialog.getByRole('button', { name: 'Confirm Checkout' }).click();

		await expect(page.getByText('Game checked out successfully!')).toBeVisible();

		// --- Checkin ---
		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await expect(checkinRow).toBeVisible();
		await expect(checkinRow).toContainText('Jane Doe');

		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		const idReminder = checkinDialog.locator('.id-reminder');
		await expect(idReminder).toBeVisible();
		await expect(idReminder).toContainText('Jane Doe');

		await checkinDialog.locator('#checkin-checkinWeight').fill('32.5');
		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Verify the game is back as available
		await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
		await expect(
			helpers.tableRow(page, game.title).first()
		).toBeVisible();
	});

	test('red weight warning when checkin weight differs beyond tolerance', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_RedWarn`);

		// Checkout with weight 32.5 (tolerance is 0.5 oz, 2% of 32.5 = 0.65)
		await helpers.checkoutGame(game.title, 'Bob', 'Smith', '32.5');

		// Checkin with weight 30.0 (difference 2.5 > tolerance 0.5 → red)
		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		await checkinDialog.locator('#checkin-checkinWeight').fill('30.0');

		const weightWarning = checkinDialog.locator('.inline-weight-warning');
		await expect(weightWarning).toBeVisible();
		await expect(weightWarning).toHaveClass(/warning-red/);
		await expect(weightWarning).toContainText('Exceeds Tolerance');

		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('yellow weight warning when difference is between 2% and tolerance', async ({ page, helpers }) => {
		// Checkout weight 10.0: 2% = 0.2, tolerance = 0.5
		// A checkin weight of 9.7 gives difference 0.3, which is > 0.2 (2%) but < 0.5 (tolerance) → yellow
		const game = await helpers.createGame(`${helpers.prefix}_YellowWarn`);

		await helpers.checkoutGame(game.title, 'Alice', 'Jones', '10.0');

		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		await checkinDialog.locator('#checkin-checkinWeight').fill('9.7');

		const weightWarning = checkinDialog.locator('.inline-weight-warning');
		await expect(weightWarning).toBeVisible();
		await expect(weightWarning).toHaveClass(/warning-yellow/);
		await expect(weightWarning).toContainText('Minor Weight Discrepancy');

		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('no weight warning when checkin weight is within 2% of checkout weight', async ({ page, helpers }) => {
		// Checkout weight 32.5: 2% = 0.65
		// A checkin weight of 32.4 gives difference 0.1, which is < 0.65 (2%) → no warning
		const game = await helpers.createGame(`${helpers.prefix}_NoWarn`);

		await helpers.checkoutGame(game.title, 'Carol', 'White', '32.5');

		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		await checkinDialog.locator('#checkin-checkinWeight').fill('32.4');

		const weightWarning = checkinDialog.locator('.inline-weight-warning');
		await expect(weightWarning).not.toBeVisible();

		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('yellow weight warning when checkin weight is heavier by more than 2% but within tolerance', async ({ page, helpers }) => {
		// Checkout weight 10.0: 2% = 0.2, tolerance = 0.5
		// A checkin weight of 10.3 gives difference 0.3, which is > 0.2 (2%) but < 0.5 (tolerance) → yellow
		const game = await helpers.createGame(`${helpers.prefix}_YellowHeavy`);

		await helpers.checkoutGame(game.title, 'Dave', 'Brown', '10.0');

		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		await checkinDialog.locator('#checkin-checkinWeight').fill('10.3');

		const weightWarning = checkinDialog.locator('.inline-weight-warning');
		await expect(weightWarning).toBeVisible();
		await expect(weightWarning).toHaveClass(/warning-yellow/);
		await expect(weightWarning).toContainText('Minor Weight Discrepancy');

		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('validation errors appear when submitting checkout without required fields', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_Validate`);

		await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
		const row = helpers.tableRow(page, game.title).first();
		await row.getByRole('button', { name: 'Checkout' }).click();

		const checkoutDialog = page.locator('dialog.checkout-dialog');
		await expect(checkoutDialog).toBeVisible();

		// Submit empty form
		await checkoutDialog.locator('#checkout-attendeeFirstName').fill('');
		await checkoutDialog.locator('#checkout-attendeeLastName').fill('');
		await checkoutDialog.getByRole('button', { name: 'Confirm Checkout' }).click();

		await expect(checkoutDialog.locator('.field-error').first()).toBeVisible();
	});
});
