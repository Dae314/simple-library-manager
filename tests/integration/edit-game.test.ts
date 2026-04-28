import { test, expect } from '@playwright/test';

test.describe('Edit Game and Status Toggle', () => {
	test('navigate to edit page from game list', async ({ page }) => {
		await page.goto('/management/games');

		// Click the "Edit" link on the first game row
		const firstRow = page.locator('.game-row').first();
		await firstRow.locator('a', { hasText: 'Edit' }).click();

		// Should navigate to the edit page
		await expect(page).toHaveURL(/\/management\/games\/\d+/);
		await expect(page.locator('h1')).toHaveText('Edit Game');

		// Verify form is pre-filled
		await expect(page.locator('#title')).not.toHaveValue('');
		await expect(page.locator('#bggId')).not.toHaveValue('');

		// Verify game header elements
		await expect(page.locator('.copy-number')).toBeVisible();
		await expect(page.locator('.status-badge')).toBeVisible();
		await expect(page.locator('a', { hasText: 'View on BGG' })).toBeVisible();
	});

	test('edit game title', async ({ page }) => {
		await page.goto('/management/games');

		// Click Edit on the first game
		const firstRow = page.locator('.game-row').first();
		await firstRow.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		// Change the title
		await page.locator('#title').fill('Renamed Test Game');
		await page.click('button:has-text("Save Changes")');

		// Should redirect to /management
		await expect(page).toHaveURL(/\/management$/);

		// Navigate to game list and verify the new title appears
		await page.goto('/management/games');
		await expect(page.locator('.game-card', { hasText: 'Renamed Test Game' })).toBeVisible();
	});

	test('edit BGG ID', async ({ page }) => {
		await page.goto('/management/games');

		// Click Edit on a game
		const firstRow = page.locator('.game-row').first();
		await firstRow.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		// Change the BGG ID
		await page.locator('#bggId').fill('99999');
		await page.click('button:has-text("Save Changes")');

		// Should redirect to /management
		await expect(page).toHaveURL(/\/management$/);
	});

	test('edit validation: empty title shows error', async ({ page }) => {
		await page.goto('/management/games');

		// Click Edit on a game
		const firstRow = page.locator('.game-row').first();
		await firstRow.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		// Clear the title and submit
		await page.locator('#title').fill('');
		await page.click('button:has-text("Save Changes")');

		// Should stay on the edit page with a validation error
		await expect(page).toHaveURL(/\/management\/games\/\d+/);
		await expect(page.locator('.field-error')).toBeVisible();
	});

	test('status toggle: mark as checked out', async ({ page }) => {
		await page.goto('/management/games');

		// Click Edit on a game (all seed games start as available)
		const firstRow = page.locator('.game-row').first();
		await firstRow.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		// Verify the game is currently available
		await expect(page.locator('.status-badge')).toHaveClass(/status-available/);

		// Click the toggle button to mark as checked out
		await page.click('.btn-toggle:has-text("Mark as Checked Out")');

		// Verify toast message
		await expect(page.getByText('Game status updated successfully!')).toBeVisible();

		// Verify status badge changed to checked out
		await expect(page.locator('.status-badge')).toHaveClass(/status-checked-out/);
	});

	test('status toggle creates corrective transaction', async ({ page }) => {
		await page.goto('/management/games');

		// Click Edit on a game
		const firstRow = page.locator('.game-row').first();
		await firstRow.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		// Toggle status to checked out
		await page.click('.btn-toggle:has-text("Mark as Checked Out")');
		await expect(page.getByText('Game status updated successfully!')).toBeVisible();

		// Navigate to transactions page and verify a corrective transaction exists
		await page.goto('/management/transactions');
		await expect(page.locator('.correction-badge').first()).toBeVisible();
	});

	test('status toggle: mark as available after checked out', async ({ page }) => {
		await page.goto('/management/games');

		// Click Edit on a game
		const firstRow = page.locator('.game-row').first();
		await firstRow.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		// First mark as checked out
		await page.click('.btn-toggle:has-text("Mark as Checked Out")');
		await expect(page.getByText('Game status updated successfully!')).toBeVisible();
		await expect(page.locator('.status-badge')).toHaveClass(/status-checked-out/);

		// Now mark as available again
		await page.click('.btn-toggle:has-text("Mark as Available")');
		await expect(page.getByText('Game status updated successfully!')).toBeVisible();

		// Verify status badge changed back to available
		await expect(page.locator('.status-badge')).toHaveClass(/status-available/);
	});
});
