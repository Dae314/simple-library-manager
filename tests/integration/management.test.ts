import { test, expect } from '@playwright/test';

test.describe('Management Area', () => {
	test.describe('Landing Page', () => {
		test('displays summary counts and navigation cards', async ({ page }) => {
			await page.goto('/management');

			await expect(page.locator('h1')).toHaveText('Management');

			// Summary bar with 4 stat cards
			const summaryBar = page.locator('.summary-bar');
			await expect(summaryBar).toBeVisible();

			const statValues = summaryBar.locator('.stat-value');
			const statLabels = summaryBar.locator('.stat-label');

			// 10 seed games, all available initially
			await expect(statValues.nth(0)).toHaveText('10');
			await expect(statLabels.nth(0)).toHaveText('Total Games');

			await expect(statValues.nth(1)).toHaveText('10');
			await expect(statLabels.nth(1)).toHaveText('Available');

			await expect(statValues.nth(2)).toHaveText('0');
			await expect(statLabels.nth(2)).toHaveText('Checked Out');

			await expect(statValues.nth(3)).toHaveText('0');
			await expect(statLabels.nth(3)).toHaveText('Retired');

			// 4 navigation cards
			const navCards = page.locator('nav.nav-cards[aria-label="Management sections"]');
			await expect(navCards).toBeVisible();

			await expect(navCards.locator('a[href="/management/games"] .card-title')).toHaveText('Games');
			await expect(navCards.locator('a[href="/management/transactions"] .card-title')).toHaveText('Transactions');
			await expect(navCards.locator('a[href="/management/config"] .card-title')).toHaveText('Configuration');
			await expect(navCards.locator('a[href="/management/backup"] .card-title')).toHaveText('Backup');
		});
	});

	test.describe('Add Game Flow', () => {
		test('adds a new game and verifies it appears in the game list', async ({ page }) => {
			await page.goto('/management/games');

			// Click "+ Add Game" link
			await page.click('a[href="/management/games/new"]');
			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('h1')).toHaveText('Add Game');

			// Fill the form
			await page.fill('#title', 'Dominion');
			await page.fill('#bggId', '36218');
			await page.selectOption('#gameType', 'standard');

			// Submit
			await page.click('button:has-text("Add Game")');

			// Should redirect to /management on success
			await expect(page).toHaveURL(/\/management$/);

			// Navigate to game list and verify the new game appears
			await page.goto('/management/games');
			await expect(page.locator('.game-card', { hasText: 'Dominion' })).toBeVisible();
		});

		test('shows validation error when title is empty', async ({ page }) => {
			await page.goto('/management/games/new');

			// Leave title empty, fill other fields
			await page.fill('#bggId', '12345');
			await page.selectOption('#gameType', 'standard');

			// Submit
			await page.click('button:has-text("Add Game")');

			// Should stay on the same page with a validation error
			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});
	});

	test.describe('Game List', () => {
		test('displays seed games with status indicators and action buttons', async ({ page }) => {
			await page.goto('/management/games');

			await expect(page.locator('h1')).toHaveText('Games');

			// Verify seed games are listed
			await expect(page.locator('.game-row')).toHaveCount(10);

			// Check that status indicators are present
			const statusIndicators = page.locator('.status-indicator');
			const count = await statusIndicators.count();
			expect(count).toBe(10);

			// All should be "Available" initially
			for (let i = 0; i < count; i++) {
				await expect(statusIndicators.nth(i)).toHaveText('Available');
				await expect(statusIndicators.nth(i)).toHaveClass(/available/);
			}

			// Each game row should have a "Retire" button and "Edit" link
			const firstRow = page.locator('.game-row').first();
			await expect(firstRow.locator('button', { hasText: 'Retire' })).toBeVisible();
			await expect(firstRow.locator('a', { hasText: 'Edit' })).toBeVisible();
		});
	});

	test.describe('Inline Retire and Restore', () => {
		test('retires a game inline and then restores it', async ({ page }) => {
			await page.goto('/management/games');

			// Find the Catan (Copy #1) game row and retire it
			const catanRetireBtn = page.locator('button[aria-label="Retire Catan"]').first();
			await catanRetireBtn.click();

			// Wait for the page to update — the game should now show "Retired" status
			await expect(page.locator('.status-indicator.retired').first()).toBeVisible();

			// The button should now say "Restore"
			const catanRestoreBtn = page.locator('button[aria-label="Restore Catan"]').first();
			await expect(catanRestoreBtn).toBeVisible();

			// Restore the game
			await catanRestoreBtn.click();

			// Wait for the page to update — the game should be "Available" again
			await expect(page.locator('button[aria-label="Retire Catan"]').first()).toBeVisible();
		});
	});

	test.describe('Bulk Select and Retire', () => {
		test('selects multiple games and retires them via bulk action', async ({ page }) => {
			await page.goto('/management/games');

			// Select first two games via checkboxes
			const checkboxes = page.locator('.game-row input[type="checkbox"]');
			await checkboxes.nth(0).check();
			await checkboxes.nth(1).check();

			// Bulk actions bar should appear
			const bulkActions = page.locator('.bulk-actions');
			await expect(bulkActions).toBeVisible();
			await expect(bulkActions.locator('.selected-count')).toContainText('2 selected');

			// Click "Retire Selected"
			await bulkActions.locator('button', { hasText: 'Retire Selected' }).click();

			// Confirmation dialog should appear
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible();
			await expect(dialog.locator('.dialog-title')).toHaveText('Retire Selected Games');

			// Confirm the retirement
			await dialog.locator('.btn-confirm').click();

			// After confirmation, the games should be retired
			await expect(page.locator('.status-indicator.retired').first()).toBeVisible();
		});
	});

	test.describe('Navigate to Edit Page', () => {
		test('clicking a game row navigates to the edit page', async ({ page }) => {
			await page.goto('/management/games');

			// Get the first game row and click on the game content area (not on a button/link/checkbox)
			const firstRow = page.locator('.game-row').first();
			const gameContent = firstRow.locator('.game-content');
			await gameContent.click();

			// Should navigate to /management/games/{id}
			await expect(page).toHaveURL(/\/management\/games\/\d+/);
			await expect(page.locator('h1')).toHaveText('Edit Game');

			// Verify the edit form is pre-filled
			await expect(page.locator('#title')).not.toHaveValue('');
			await expect(page.locator('#bggId')).not.toHaveValue('');
		});
	});

	test.describe('Select All Checkbox', () => {
		test('select all checkbox toggles all game selections', async ({ page }) => {
			await page.goto('/management/games');

			// Click "Select all" checkbox
			const selectAll = page.locator('input[aria-label="Select all games"]');
			await selectAll.check();

			// Bulk actions bar should show all games selected
			const bulkActions = page.locator('.bulk-actions');
			await expect(bulkActions).toBeVisible();
			await expect(bulkActions.locator('.selected-count')).toContainText('10 selected');

			// Uncheck select all
			await selectAll.uncheck();

			// Bulk actions bar should disappear
			await expect(bulkActions).not.toBeVisible();
		});
	});
});
