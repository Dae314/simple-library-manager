import { test, expect } from '@playwright/test';

test.describe('Retired Games Visibility', () => {
	test('retired game disappears from checkout page', async ({ page }) => {
		// Verify Splendor is visible on /checkout
		await page.goto('/checkout');
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).toBeVisible();

		// Go to management, retire Splendor
		await page.goto('/management/games');
		await page.locator('button[aria-label="Retire Splendor"]').click();
		await expect(page.locator('.status-indicator.retired').first()).toBeVisible();

		// Go back to checkout — Splendor should be gone
		await page.goto('/checkout');
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).not.toBeVisible();
	});

	test('retired game disappears from checkin page', async ({ page }) => {
		// First, checkout Splendor so it appears on the checkin page
		await page.goto('/checkout');
		const splendorCard = page.locator('.game-card', { hasText: 'Splendor' });
		await expect(splendorCard).toBeVisible();
		await splendorCard.getByRole('button', { name: 'Checkout' }).click();

		const checkoutForm = page.locator('section[aria-label="Checkout form"]');
		await expect(checkoutForm).toBeVisible();
		await checkoutForm.locator('#attendeeFirstName').fill('Retire');
		await checkoutForm.locator('#attendeeLastName').fill('Test');
		await checkoutForm.locator('#idType').selectOption({ index: 1 });
		await checkoutForm.locator('#checkoutWeight').fill('20');
		await checkoutForm.getByRole('button', { name: 'Confirm Checkout' }).click();
		await expect(page.getByText('Game checked out successfully!')).toBeVisible();

		// Verify Splendor is visible on /checkin (it's checked out)
		await page.goto('/checkin');
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).toBeVisible();

		// Go to management, retire Splendor (even though it's checked out)
		await page.goto('/management/games');
		await page.locator('button[aria-label="Retire Splendor"]').click();
		await expect(page.locator('.status-indicator.retired').first()).toBeVisible();

		// Go back to checkin — Splendor should be gone
		await page.goto('/checkin');
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).not.toBeVisible();
	});

	test('restoring a retired game makes it appear on checkout page again', async ({ page }) => {
		// Retire Splendor via management
		await page.goto('/management/games');
		await page.locator('button[aria-label="Retire Splendor"]').click();
		await expect(page.locator('.status-indicator.retired').first()).toBeVisible();

		// Verify Splendor is NOT on /checkout
		await page.goto('/checkout');
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).not.toBeVisible();

		// Go to management, filter by "retired" status to find Splendor
		await page.goto('/management/games');
		await page.locator('#filter-status').selectOption('retired');
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).toBeVisible();

		// Restore Splendor
		await page.locator('button[aria-label="Restore Splendor"]').click();

		// Go to checkout — Splendor should be visible again
		await page.goto('/checkout');
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).toBeVisible();
	});

	test('retired game still visible in management area', async ({ page }) => {
		await page.goto('/management/games');

		// Retire Splendor
		await page.locator('button[aria-label="Retire Splendor"]').click();

		// The game should still appear with "Retired" status indicator
		const splendorRow = page.locator('.game-row', { hasText: 'Splendor' });
		await expect(splendorRow).toBeVisible();

		const retiredBadge = splendorRow.locator('.status-indicator.retired');
		await expect(retiredBadge).toBeVisible();
		await expect(retiredBadge).toHaveText('Retired');
	});
});
