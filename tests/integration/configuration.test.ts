import { test, expect } from '@playwright/test';

test.describe('Convention Configuration Page', () => {
	test('config page renders with defaults', async ({ page }) => {
		await page.goto('/management/config');

		await expect(page.locator('h1')).toHaveText('Convention Configuration');

		// Form fields are present
		await expect(page.locator('#conventionName')).toBeVisible();
		await expect(page.locator('#startDate')).toBeVisible();
		await expect(page.locator('#endDate')).toBeVisible();
		await expect(page.locator('#weightTolerance')).toBeVisible();
		await expect(page.locator('#weightUnit')).toBeVisible();

		// Default values
		await expect(page.locator('#weightUnit')).toHaveValue('oz');
		await expect(page.locator('#weightTolerance')).toHaveValue('0.5');

		// Sections present
		const sections = page.locator('.config-section');
		await expect(sections).toHaveCount(2);

		// Save button and Back link
		await expect(page.getByRole('button', { name: 'Save Configuration' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
	});

	test('save convention name and verify in navbar', async ({ page }) => {
		await page.goto('/management/config');

		await page.locator('#conventionName').fill('TestCon 2026');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		await expect(page.getByText('Configuration saved.')).toBeVisible();

		// Navigate to checkout and verify navbar brand shows the convention name
		await page.goto('/checkout');
		await expect(page.locator('.brand')).toHaveText('TestCon 2026');
	});

	test('save convention dates', async ({ page }) => {
		await page.goto('/management/config');

		await page.locator('#startDate').fill('2026-06-01');
		await page.locator('#endDate').fill('2026-06-05');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		await expect(page.getByText('Configuration saved.')).toBeVisible();
	});

	test('change weight unit', async ({ page }) => {
		await page.goto('/management/config');

		await page.locator('#weightUnit').selectOption('kg');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		await expect(page.getByText('Configuration saved.')).toBeVisible();
	});

	test('validation: end date before start date', async ({ page }) => {
		await page.goto('/management/config');

		await page.locator('#startDate').fill('2026-05-10');
		await page.locator('#endDate').fill('2026-05-01');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Validation error should appear on endDate
		const endDateGroup = page.locator('#endDate').locator('..');
		await expect(endDateGroup.locator('.field-error')).toBeVisible();
	});

	test('validation: non-positive weight tolerance', async ({ page }) => {
		await page.goto('/management/config');

		// Test with 0
		await page.locator('#weightTolerance').fill('0');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		const toleranceGroup = page.locator('#weightTolerance').locator('..');
		await expect(toleranceGroup.locator('.field-error')).toBeVisible();

		// Test with negative value
		await page.locator('#weightTolerance').fill('-1');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		await expect(toleranceGroup.locator('.field-error')).toBeVisible();
	});

	test('add an ID type', async ({ page }) => {
		await page.goto('/management/config');

		await page.getByLabel('New ID type name').fill('Passport');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect(page.getByText('ID type added.')).toBeVisible();
		await expect(page.locator('.id-type-name', { hasText: 'Passport' })).toBeVisible();
	});

	test('remove an ID type', async ({ page }) => {
		await page.goto('/management/config');

		// First add an ID type to ensure one exists
		await page.getByLabel('New ID type name').fill('TempID');
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByText('ID type added.')).toBeVisible();
		await expect(page.locator('.id-type-name', { hasText: 'TempID' })).toBeVisible();

		// Now remove it
		await page.getByRole('button', { name: 'Remove TempID' }).click();

		await expect(page.getByText('ID type removed.')).toBeVisible();
		await expect(page.locator('.id-type-name', { hasText: 'TempID' })).not.toBeVisible();
	});

	test('ID type appears in checkout form', async ({ page }) => {
		await page.goto('/management/config');

		// Add a new ID type "Badge"
		await page.getByLabel('New ID type name').fill('Badge');
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByText('ID type added.')).toBeVisible();

		// Navigate to checkout page
		await page.goto('/checkout');

		// Select a game to open the checkout form
		const gameCard = page.locator('.game-card').first();
		await gameCard.getByRole('button', { name: 'Checkout' }).click();

		const checkoutForm = page.locator('section[aria-label="Checkout form"]');
		await expect(checkoutForm).toBeVisible();

		// Verify "Badge" appears as an option in the ID type dropdown
		const idTypeSelect = checkoutForm.locator('#idType');
		await expect(idTypeSelect.locator('option', { hasText: 'Badge' })).toBeVisible();
	});
});
