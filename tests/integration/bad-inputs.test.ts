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
			await page.selectOption('#gameType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('rejects empty BGG ID', async ({ page, helpers }) => {
			await page.goto('/management/games/new');

			await page.fill('#title', `${helpers.prefix}_BadBGG`);
			await page.locator('#bggId').fill('');
			await page.selectOption('#gameType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('rejects negative BGG ID', async ({ page, helpers }) => {
			await page.goto('/management/games/new');

			await page.fill('#title', `${helpers.prefix}_NegBGG`);
			await page.fill('#bggId', '-1');
			await page.selectOption('#gameType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('rejects zero BGG ID', async ({ page, helpers }) => {
			await page.goto('/management/games/new');

			await page.fill('#title', `${helpers.prefix}_ZeroBGG`);
			await page.fill('#bggId', '0');
			await page.selectOption('#gameType', 'standard');
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

			await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const form = page.locator('section[aria-label="Checkout form"]');
			await expect(form).toBeVisible();

			await form.locator('#attendeeFirstName').fill('');
			await form.locator('#attendeeLastName').fill('Doe');
			await form.locator('#idType').selectOption({ index: 1 });
			await form.locator('#checkoutWeight').fill('30');
			await form.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(form.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkout with empty last name', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_NoLast`);

			await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const form = page.locator('section[aria-label="Checkout form"]');
			await expect(form).toBeVisible();

			await form.locator('#attendeeFirstName').fill('Jane');
			await form.locator('#attendeeLastName').fill('');
			await form.locator('#idType').selectOption({ index: 1 });
			await form.locator('#checkoutWeight').fill('30');
			await form.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(form.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkout with zero weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_ZeroWt`);

			await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const form = page.locator('section[aria-label="Checkout form"]');
			await expect(form).toBeVisible();

			await form.locator('#attendeeFirstName').fill('Jane');
			await form.locator('#attendeeLastName').fill('Doe');
			await form.locator('#idType').selectOption({ index: 1 });
			await form.locator('#checkoutWeight').fill('0');
			await form.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(form.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkout with negative weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_NegWt`);

			await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Checkout' }).click();

			const form = page.locator('section[aria-label="Checkout form"]');
			await expect(form).toBeVisible();

			await form.locator('#attendeeFirstName').fill('Jane');
			await form.locator('#attendeeLastName').fill('Doe');
			await form.locator('#idType').selectOption({ index: 1 });
			await form.locator('#checkoutWeight').fill('-5');
			await form.getByRole('button', { name: 'Confirm Checkout' }).click();

			await expect(form.locator('.field-error').first()).toBeVisible();
		});
	});

	test.describe('Checkin — Invalid Inputs', () => {
		test('rejects checkin with zero weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_CIZero`);
			await helpers.checkoutGame(game.title, 'Bob', 'Smith', '30');

			await page.goto('/checkin');
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Check In' }).click();

			const form = page.locator('section[aria-label="Check in form"]');
			await expect(form).toBeVisible();

			await form.locator('#checkinWeight').fill('0');
			await form.getByRole('button', { name: 'Confirm Check In' }).click();

			await expect(form.locator('.field-error').first()).toBeVisible();
		});

		test('rejects checkin with negative weight', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_CINeg`);
			await helpers.checkoutGame(game.title, 'Bob', 'Smith', '30');

			await page.goto('/checkin');
			const row = helpers.tableRow(page, game.title).first();
			await row.getByRole('button', { name: 'Check In' }).click();

			const form = page.locator('section[aria-label="Check in form"]');
			await expect(form).toBeVisible();

			await form.locator('#checkinWeight').fill('-2');
			await form.getByRole('button', { name: 'Confirm Check In' }).click();

			await expect(form.locator('.field-error').first()).toBeVisible();
		});
	});
});
