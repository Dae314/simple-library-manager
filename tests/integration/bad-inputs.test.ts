import { test, expect } from './fixtures';

test.describe('Bad Input Handling', () => {
	test.describe('Configuration — ID Types', () => {
		test('rejects duplicate ID type name', async ({ page, helpers }) => {
			const idTypeName = `${helpers.prefix}_DupID`;

			await page.goto('/management/config');

			// Add the ID type once
			await page.getByLabel('New ID type name').fill(idTypeName);
			await page.getByRole('button', { name: 'Add' }).click();
			await expect(page.getByText('ID type added.')).toBeVisible();

			// Try to add the same name again
			await page.getByLabel('New ID type name').fill(idTypeName);
			await page.getByRole('button', { name: 'Add' }).click();

			// Should show an error toast, not a success toast
			await expect(page.getByText('already exists')).toBeVisible();

			// Clean up
			await page.getByRole('button', { name: `Remove ${idTypeName}` }).click();
			await expect(page.getByText('ID type removed.')).toBeVisible();
		});

		test('add button is disabled when ID type name is empty', async ({ page }) => {
			await page.goto('/management/config');

			await page.getByLabel('New ID type name').fill('');

			// The Add button should be disabled when input is empty
			await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
		});

		test('add button is disabled when ID type name is whitespace-only', async ({ page }) => {
			await page.goto('/management/config');

			await page.getByLabel('New ID type name').fill('   ');

			// The Add button should be disabled when input is only whitespace
			await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
		});
	});

	test.describe('Configuration — Weight Tolerance', () => {
		test('rejects negative weight tolerance', async ({ page }) => {
			await page.goto('/management/config');

			await page.locator('#weightTolerance').fill('-5');
			await page.getByRole('button', { name: 'Save Configuration' }).click();

			const toleranceGroup = page.locator('#weightTolerance').locator('..');
			await expect(toleranceGroup.locator('.field-error')).toBeVisible();
		});

		test('rejects zero weight tolerance', async ({ page }) => {
			await page.goto('/management/config');

			await page.locator('#weightTolerance').fill('0');
			await page.getByRole('button', { name: 'Save Configuration' }).click();

			const toleranceGroup = page.locator('#weightTolerance').locator('..');
			await expect(toleranceGroup.locator('.field-error')).toBeVisible();
		});
	});

	test.describe('Add Game — Invalid Inputs', () => {
		test('rejects empty title', async ({ page }) => {
			await page.goto('/management/games/new');

			await page.fill('#bggId', '12345');
			await page.selectOption('#prizeType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('rejects empty BGG ID', async ({ page, helpers }) => {
			await page.goto('/management/games/new');

			await page.fill('#title', `${helpers.prefix}_BadBGG`);
			await page.locator('#bggId').fill('');
			await page.selectOption('#prizeType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('rejects negative BGG ID', async ({ page, helpers }) => {
			await page.goto('/management/games/new');

			await page.fill('#title', `${helpers.prefix}_NegBGG`);
			await page.fill('#bggId', '-1');
			await page.selectOption('#prizeType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('rejects zero BGG ID', async ({ page, helpers }) => {
			await page.goto('/management/games/new');

			await page.fill('#title', `${helpers.prefix}_ZeroBGG`);
			await page.fill('#bggId', '0');
			await page.selectOption('#prizeType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});
	});

	test.describe('Edit Game — Invalid Inputs', () => {
		test('rejects empty title on edit', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_EditEmpty`);

			await page.goto(`/management/games?search=${helpers.prefix}_EditEmpty`);
			const row = helpers.tableRow(page, game.title);
			await row.locator('a', { hasText: 'Edit' }).click();
			await expect(page).toHaveURL(/\/management\/games\/\d+/);

			await page.locator('#title').fill('');
			await page.click('button:has-text("Save Changes")');

			await expect(page).toHaveURL(/\/management\/games\/\d+/);
			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('rejects invalid BGG ID on edit', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_EditBadBGG`);

			await page.goto(`/management/games?search=${helpers.prefix}_EditBadBGG`);
			const row = helpers.tableRow(page, game.title);
			await row.locator('a', { hasText: 'Edit' }).click();
			await expect(page).toHaveURL(/\/management\/games\/\d+/);

			await page.locator('#bggId').fill('-10');
			await page.click('button:has-text("Save Changes")');

			await expect(page).toHaveURL(/\/management\/games\/\d+/);
			await expect(page.locator('.field-error')).toBeVisible();
		});
	});

	test.describe('Checkout — Invalid Inputs', () => {
		test('rejects checkout with empty first name', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_NoFirst`);

			await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const dialog = page.locator('dialog.checkout-dialog');
			await expect(dialog).toBeVisible();

			await dialog.locator('#checkout-attendeeFirstName').fill('');
			await dialog.locator('#checkout-attendeeLastName').fill('Doe');
			await dialog.locator('#checkout-idType').selectOption({ index: 1 });
			await dialog.locator('#checkout-checkoutWeight').fill('30');
			await dialog.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(dialog.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkout with empty last name', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_NoLast`);

			await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const dialog = page.locator('dialog.checkout-dialog');
			await expect(dialog).toBeVisible();

			await dialog.locator('#checkout-attendeeFirstName').fill('Jane');
			await dialog.locator('#checkout-attendeeLastName').fill('');
			await dialog.locator('#checkout-idType').selectOption({ index: 1 });
			await dialog.locator('#checkout-checkoutWeight').fill('30');
			await dialog.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(dialog.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkout with zero weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_ZeroWt`);

			await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const dialog = page.locator('dialog.checkout-dialog');
			await expect(dialog).toBeVisible();

			await dialog.locator('#checkout-attendeeFirstName').fill('Jane');
			await dialog.locator('#checkout-attendeeLastName').fill('Doe');
			await dialog.locator('#checkout-idType').selectOption({ index: 1 });
			await dialog.locator('#checkout-checkoutWeight').fill('0');
			await dialog.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(dialog.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkout with negative weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_NegWt`);

			await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await expect(row).toBeVisible({ timeout: 10_000 });
			await row.getByRole('button', { name: 'Checkout' }).click();

			const dialog = page.locator('dialog.checkout-dialog');
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			await dialog.locator('#checkout-attendeeFirstName').fill('Jane');
			await dialog.locator('#checkout-attendeeLastName').fill('Doe');
			await dialog.locator('#checkout-idType').selectOption({ index: 1 });
			await dialog.locator('#checkout-checkoutWeight').fill('-5');
			await dialog.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(dialog.locator('.field-error').first()).toBeVisible();
		});
	});

	test.describe('Checkin — Invalid Inputs', () => {
		test('rejects checkin with zero weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_CIZero`);
			await helpers.checkoutGame(game.title, 'Bob', 'Smith', '30');

			await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Check In' }).click();

			const dialog = page.locator('dialog.checkin-dialog');
			await expect(dialog).toBeVisible();

			await dialog.locator('#checkin-checkinWeight').fill('0');
			await dialog.getByRole('button', { name: 'Confirm Check In' }).click();

			await expect(dialog.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkin with negative weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_CINeg`);
			await helpers.checkoutGame(game.title, 'Bob', 'Smith', '30');

			await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Check In' }).click();

			const dialog = page.locator('dialog.checkin-dialog');
			await expect(dialog).toBeVisible();

			await dialog.locator('#checkin-checkinWeight').fill('-2');
			await dialog.getByRole('button', { name: 'Confirm Check In' }).click();

			await expect(dialog.locator('.field-error').first()).toBeVisible();
		});
	});
});
