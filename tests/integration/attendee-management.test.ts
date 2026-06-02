import { test, expect } from './fixtures';

test.describe('Attendee Management', () => {
	test.describe('Attendee List Page', () => {
		test('attendee appears in list after checkout creates them', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_AttList`);
			const firstName = `First${helpers.prefix.slice(0, 8)}`;
			const lastName = `Last${helpers.prefix.slice(0, 8)}`;

			// Checkout creates the attendee
			await helpers.checkoutGame(game.title, firstName, lastName, '10.0');

			// Navigate to attendee management page with search param directly
			await page.goto(`/management/attendees?search=${encodeURIComponent(firstName)}`);
			await expect(page.locator('h1')).toContainText('Attendees');

			// Attendee should appear in the list
			const row = helpers.tableRow(page, firstName);
			await expect(row).toBeVisible();
			await expect(row).toContainText(lastName);
		});
	});

	test.describe('Search', () => {
		test('typing attendee name filters the list to matching attendees', async ({ page, helpers }) => {
			const game1 = await helpers.createGame(`${helpers.prefix}_Search1`);
			const game2 = await helpers.createGame(`${helpers.prefix}_Search2`);
			const uniqueName = `Srch${helpers.prefix.slice(0, 6)}`;

			// Create two attendees via checkout
			await helpers.checkoutGame(game1.title, uniqueName, 'Alpha', '10.0');
			await helpers.checkoutGame(game2.title, 'Other', 'Person', '10.0');

			// Navigate to attendee management with search param directly
			await page.goto(`/management/attendees?search=${encodeURIComponent(uniqueName)}`);

			// Only the matching attendee should be visible
			await expect(helpers.tableRow(page, uniqueName)).toBeVisible();
			await expect(helpers.tableRow(page, 'Other')).not.toBeVisible();
		});
	});

	test.describe('Edit', () => {
		test('click attendee row, edit name, save redirects back with success', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_Edit`);
			const firstName = `Ed${helpers.prefix.slice(0, 6)}`;
			const lastName = `Itable${helpers.prefix.slice(0, 5)}`;

			// Create attendee via checkout
			await helpers.checkoutGame(game.title, firstName, lastName, '10.0');

			// Check in the game so the attendee has no active checkouts
			await helpers.checkinGame(game.title, '10.0');

			// Navigate to attendee management and find the attendee
			await page.goto(`/management/attendees?search=${firstName}`);
			const row = helpers.tableRow(page, firstName);
			await expect(row).toBeVisible();

			// Click on the row to navigate to edit page
			await row.locator('.attendee-name').first().click();
			await expect(page).toHaveURL(/\/management\/attendees\/\d+/);
			await expect(page.locator('h1')).toContainText('Edit Attendee');

			// Verify current values are loaded
			await expect(page.locator('#firstName')).toHaveValue(firstName);
			await expect(page.locator('#lastName')).toHaveValue(lastName);

			// Change the first name
			const newFirstName = `New${helpers.prefix.slice(0, 6)}`;
			await page.locator('#firstName').fill(newFirstName);
			await page.locator('button[type="submit"]').click();

			// Should redirect back to attendees list with success toast
			await expect(page.getByText('Attendee updated successfully!')).toBeVisible();
			await expect(page).toHaveURL(/\/management\/attendees$/);

			// Verify the updated name appears
			await page.goto(`/management/attendees?search=${newFirstName}`);
			await expect(helpers.tableRow(page, newFirstName)).toBeVisible();
		});
	});

	test.describe('Delete with Cascade', () => {
		test('delete attendee with transactions shows cascade count and removes attendee', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_DelCasc`);
			const firstName = `Del${helpers.prefix.slice(0, 6)}`;
			const lastName = `Cascade${helpers.prefix.slice(0, 4)}`;

			// Create attendee via checkout (creates a transaction)
			await helpers.checkoutGame(game.title, firstName, lastName, '10.0');

			// Check in the game so the attendee has no active checkouts
			await helpers.checkinGame(game.title, '10.0');

			// Navigate to attendee management
			await page.goto(`/management/attendees?search=${firstName}`);
			const row = helpers.tableRow(page, firstName);
			await expect(row).toBeVisible();

			// Click delete button
			await row.getByRole('button', { name: `Delete ${firstName} ${lastName}` }).click();

			// Confirmation dialog should show cascade count
			const dialog = page.locator('dialog');
			await expect(dialog).toBeVisible();
			await expect(dialog).toContainText('will also be permanently deleted');
			await expect(dialog).toContainText('transaction');

			// Confirm deletion
			await dialog.locator('button', { hasText: 'Delete' }).click();

			// Success toast
			await expect(page.getByText(`Deleted "${firstName} ${lastName}"`)).toBeVisible();

			// Attendee should no longer appear
			await expect(helpers.tableRow(page, firstName)).not.toBeVisible();
		});
	});

	test.describe('Active Checkout Prevention', () => {
		test('delete dialog blocks deletion for attendee with active checkouts', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_ActiveCO`);
			const firstName = `Active${helpers.prefix.slice(0, 5)}`;
			const lastName = `Block${helpers.prefix.slice(0, 5)}`;

			// Create attendee via checkout — game stays checked out
			await helpers.checkoutGame(game.title, firstName, lastName, '10.0');

			// Navigate to attendee management
			await page.goto(`/management/attendees?search=${firstName}`);
			const row = helpers.tableRow(page, firstName);
			await expect(row).toBeVisible();

			// Opening the dialog is allowed, but it warns and disables the confirm button
			await row.getByRole('button', { name: `Delete ${firstName} ${lastName}` }).click();

			const dialog = page.locator('dialog');
			await expect(dialog).toBeVisible();
			await expect(dialog).toContainText('game checked out');

			const confirmButton = dialog.getByRole('button', { name: 'Delete' });
			await expect(confirmButton).toBeDisabled();

			// Cancel out of the dialog
			await dialog.getByRole('button', { name: 'Cancel' }).click();

			// After checking the game back in, deletion is allowed
			await helpers.checkinGame(game.title, '10.0');
			await page.goto(`/management/attendees?search=${firstName}`);
			await helpers.tableRow(page, firstName)
				.getByRole('button', { name: `Delete ${firstName} ${lastName}` })
				.click();
			await expect(page.locator('dialog').getByRole('button', { name: 'Delete' })).toBeEnabled();
		});
	});

	test.describe('Delete from Edit Page', () => {
		test('edit page delete removes attendee and redirects to list', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_EditDel`);
			const firstName = `EdDel${helpers.prefix.slice(0, 5)}`;
			const lastName = `Gone${helpers.prefix.slice(0, 5)}`;

			// Create attendee via checkout, then check in so they have no active checkouts
			await helpers.checkoutGame(game.title, firstName, lastName, '10.0');
			await helpers.checkinGame(game.title, '10.0');

			// Navigate to the attendee edit page
			await page.goto(`/management/attendees?search=${firstName}`);
			await helpers.tableRow(page, firstName).locator('.attendee-name').first().click();
			await expect(page).toHaveURL(/\/management\/attendees\/\d+/);

			// Danger zone delete button opens the confirm dialog
			await page.getByRole('button', { name: 'Delete Attendee' }).click();
			const dialog = page.locator('dialog');
			await expect(dialog).toBeVisible();
			await dialog.getByRole('button', { name: 'Delete' }).click();

			// Redirects back to the list with a success toast
			await expect(page.getByText(`Deleted "${firstName} ${lastName}"`)).toBeVisible();
			await expect(page).toHaveURL(/\/management\/attendees$/);

			// Attendee no longer appears
			await page.goto(`/management/attendees?search=${firstName}`);
			await expect(helpers.tableRow(page, firstName)).not.toBeVisible();
		});

		test('edit page delete button is disabled for attendee with active checkouts', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_EditBlk`);
			const firstName = `EdBlk${helpers.prefix.slice(0, 5)}`;
			const lastName = `Held${helpers.prefix.slice(0, 5)}`;

			// Create attendee via checkout — game stays checked out
			await helpers.checkoutGame(game.title, firstName, lastName, '10.0');

			// Navigate to the attendee edit page
			await page.goto(`/management/attendees?search=${firstName}`);
			await helpers.tableRow(page, firstName).locator('.attendee-name').first().click();
			await expect(page).toHaveURL(/\/management\/attendees\/\d+/);

			// Danger zone explains why and disables the delete button
			await expect(page.getByText('This attendee has a game checked out')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Delete Attendee' })).toBeDisabled();
		});
	});
});
