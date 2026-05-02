import { test, expect } from './fixtures';

test.describe('Game Deletion', () => {
	test('full deletion lifecycle: checked-out guard, confirm dialog, delete, redirect, toast', async ({
		page,
		helpers
	}) => {
		const game = await helpers.createGame(`${helpers.prefix}_Delete`);

		// --- Checkout the game (creates transaction #1) ---
		await helpers.checkoutGame(game.title, 'Alice', 'Tester', '25.0');

		// --- Navigate to game detail page and verify delete button is disabled ---
		await page.goto(`/management/games/${game.id}`);
		await expect(page.locator('h1')).toContainText('Edit Game');

		const deleteButton = page.getByRole('button', { name: 'Delete Game' });
		await expect(deleteButton).toBeVisible();
		await expect(deleteButton).toBeDisabled();

		// Verify the explanatory message for checked-out games
		await expect(
			page.getByText('This game must be checked in before it can be deleted')
		).toBeVisible();

		// --- Check in the game (creates transaction #2) ---
		await helpers.checkinGame(game.title, '25.0');

		// --- Navigate back to game detail page ---
		await page.goto(`/management/games/${game.id}`);
		await expect(page.locator('h1')).toContainText('Edit Game');

		// Delete button should now be enabled
		const enabledDeleteButton = page.getByRole('button', { name: 'Delete Game' });
		await expect(enabledDeleteButton).toBeEnabled();

		// --- Click the delete button to open confirmation dialog ---
		await enabledDeleteButton.click();

		const dialog = page.locator('dialog[aria-label="Delete Game"]');
		await expect(dialog).toBeVisible();

		// Verify the dialog shows the correct transaction count (2: one checkout + one checkin)
		await expect(dialog.getByText('2 transactions')).toBeVisible();

		// Verify the warning about permanent deletion
		await expect(dialog.getByText('This action cannot be undone')).toBeVisible();

		// --- Confirm the deletion ---
		await dialog.getByRole('button', { name: 'Delete' }).click();

		// --- Verify redirect to games list page ---
		await expect(page).toHaveURL(/\/management\/games/);

		// --- Verify success toast ---
		await expect(page.getByText('Game deleted successfully').first()).toBeVisible();

		// --- Verify the game no longer appears in the games list ---
		await page.goto(`/management/games?search=${encodeURIComponent(game.title)}`);
		await expect(helpers.tableRow(page, game.title)).not.toBeVisible();
	});
});
