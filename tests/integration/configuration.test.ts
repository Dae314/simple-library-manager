import { test, expect } from './fixtures';

test.describe('Convention Configuration Page', () => {
	test('config page renders with defaults', async ({ page }) => {
		await page.goto('/management/config');

		await expect(page.locator('h1')).toHaveText('Convention Configuration');

		await expect(page.locator('#conventionName')).toBeVisible();
		await expect(page.locator('#startDate')).toBeVisible();
		await expect(page.locator('#endDate')).toBeVisible();
		await expect(page.locator('#weightTolerance')).toBeVisible();
		await expect(page.locator('#weightUnit')).toBeVisible();

		const sections = page.locator('.config-section');
		await expect(sections).toHaveCount(3);

		await expect(page.getByRole('button', { name: 'Save Configuration' })).toBeVisible();
	});

	test('save convention name shows success toast', async ({ page }) => {
		await page.goto('/management/config');
		await page.locator('#conventionName').fill('TestCon 2026');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		await expect(page.getByText('Configuration saved.')).toBeVisible();
	});

	test('save convention dates', async ({ page }) => {
		await page.goto('/management/config');

		await page.locator('#startDate').fill('2026-06-01');
		await page.locator('#endDate').fill('2026-06-05');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		await expect(page.getByText('Configuration saved.')).toBeVisible();
	});

	test('validation: end date before start date', async ({ page }) => {
		await page.goto('/management/config');

		await page.locator('#startDate').fill('2026-05-10');
		await page.locator('#endDate').fill('2026-05-01');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		const endDateGroup = page.locator('#endDate').locator('..');
		await expect(endDateGroup.locator('.field-error')).toBeVisible();
	});

	test('validation: live client-side feedback for inverted date range', async ({ page }) => {
		await page.goto('/management/config');

		// Set start date after end date — error should appear immediately without submitting
		await page.locator('#startDate').fill('2026-07-15');
		await page.locator('#endDate').fill('2026-07-01');

		const endDateGroup = page.locator('#endDate').locator('..');
		const errorMessage = endDateGroup.locator('.field-error');
		await expect(errorMessage).toBeVisible();
		await expect(errorMessage).toHaveText('End date must be on or after the start date');

		// Verify the end date input has aria-invalid attribute
		await expect(page.locator('#endDate')).toHaveAttribute('aria-invalid', 'true');

		// Fix the range — error should disappear without submitting
		await page.locator('#endDate').fill('2026-07-20');
		await expect(errorMessage).not.toBeVisible();
		await expect(page.locator('#endDate')).not.toHaveAttribute('aria-invalid');
	});

	test('validation: no live error when only one date is set', async ({ page }) => {
		await page.goto('/management/config');

		// Clear both dates first
		await page.locator('#startDate').fill('');
		await page.locator('#endDate').fill('');

		// Set only end date — no error should appear
		await page.locator('#endDate').fill('2026-03-01');
		const endDateGroup = page.locator('#endDate').locator('..');
		await expect(endDateGroup.locator('.field-error')).not.toBeVisible();

		// Set only start date, clear end date — no error
		await page.locator('#startDate').fill('2026-09-01');
		await page.locator('#endDate').fill('');
		await expect(endDateGroup.locator('.field-error')).not.toBeVisible();
	});

	test('validation: non-positive weight tolerance', async ({ page }) => {
		await page.goto('/management/config');

		await page.locator('#weightTolerance').fill('0');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		const toleranceGroup = page.locator('#weightTolerance').locator('..');
		await expect(toleranceGroup.locator('.field-error')).toBeVisible();

		await page.locator('#weightTolerance').fill('-1');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		await expect(toleranceGroup.locator('.field-error')).toBeVisible();
	});

	test('add and remove an ID type', async ({ page, helpers }) => {
		const idTypeName = `${helpers.prefix}_IDType`;

		await page.goto('/management/config');

		// Add
		await page.getByLabel('New ID type name').fill(idTypeName);
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByText('ID type added.')).toBeVisible();
		await expect(page.locator('.id-type-name', { hasText: idTypeName })).toBeVisible();

		// Remove
		await page.getByRole('button', { name: `Remove ${idTypeName}` }).click();
		await expect(page.getByText('ID type removed.')).toBeVisible();
		await expect(page.locator('.id-type-name', { hasText: idTypeName })).not.toBeVisible();
	});

	test('ID type appears in checkout form', async ({ page, helpers }) => {
		const idTypeName = `${helpers.prefix}_Badge`;

		await page.goto('/management/config');

		await page.getByLabel('New ID type name').fill(idTypeName);
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByText('ID type added.')).toBeVisible();

		// Create a game to open checkout form with
		const game = await helpers.createGame(`${helpers.prefix}_IdTypeTest`);

		await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
		const gameRow = page.locator('tbody tr', { hasText: game.title }).first();
		await gameRow.getByRole('button', { name: 'Checkout' }).click();

		const checkoutDialog = page.locator('dialog.checkout-dialog');
		await expect(checkoutDialog).toBeVisible();

		const idTypeSelect = checkoutDialog.locator('#checkout-idType');
		await expect(idTypeSelect.locator('option', { hasText: idTypeName })).toBeAttached();

		// Clean up the ID type
		await page.goto('/management/config');
		await page.getByRole('button', { name: `Remove ${idTypeName}` }).click();
		await expect(page.getByText('ID type removed.')).toBeVisible();
	});
});
