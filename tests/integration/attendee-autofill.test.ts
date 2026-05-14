import { test, expect } from './fixtures';

test.describe('Attendee Autofill', () => {
	test('checkout dialog autofill: typing attendee name shows suggestions and selecting populates fields', async ({
		page,
		helpers
	}) => {
		// First, create a game and checkout to establish an attendee record
		const game1 = await helpers.createGame(`${helpers.prefix}_AutofillSetup`);
		await helpers.checkoutGame(game1.title, 'Samantha', 'Rodriguez', '25');
		await helpers.checkinGame(game1.title, '25');

		// Now create a second game and try to checkout with autofill
		const game2 = await helpers.createGame(`${helpers.prefix}_AutofillTest`);
		await page.goto(`/library?search=${encodeURIComponent(game2.title)}`);
		const row = helpers.tableRow(page, game2.title).first();
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: 'Checkout' }).click();

		const dialog = page.locator('dialog.checkout-dialog');
		await expect(dialog).toBeVisible();

		// Type at least 2 characters in the first name field to trigger autofill
		const firstNameInput = dialog.locator('.attendee-autofill').first().locator('input[type="text"]');
		await firstNameInput.fill('Sam');

		// Wait for suggestions to appear (debounce + fetch)
		const suggestions = dialog.locator('.suggestions').first();
		await expect(suggestions).toBeVisible({ timeout: 5000 });

		// Verify the suggestion contains the attendee we created
		const suggestionItem = suggestions.locator('.suggestion-item', { hasText: 'Samantha Rodriguez' });
		await expect(suggestionItem).toBeVisible();

		// Click the suggestion
		await suggestionItem.click();

		// Verify all fields are populated
		const firstNameValue = await dialog
			.locator('input[name="attendeeFirstName"]')
			.inputValue();
		expect(firstNameValue).toBe('Samantha');

		const lastNameValue = await dialog
			.locator('input[name="attendeeLastName"]')
			.inputValue();
		expect(lastNameValue).toBe('Rodriguez');

		// ID type should be populated (the select should have a value)
		const idTypeSelect = dialog.locator('#checkout-idType');
		const idTypeValue = await idTypeSelect.inputValue();
		expect(idTypeValue).not.toBe('');
	});

	test.fixme('library page attendee filter: autofill suggestions appear and selecting filters the library', async ({
		page,
		helpers
	}) => {
		// Create a game and checkout to establish an attendee record
		const game = await helpers.createGame(`${helpers.prefix}_LibFilter`);
		await helpers.checkoutGame(game.title, 'Fernando', 'Gutierrez', '30');

		// Go to the library page
		await page.goto('/library');

		// Find the attendee search autofill input in the filter panel
		const attendeeFilter = page.locator('.attendee-autofill').first();
		const filterInput = attendeeFilter.locator('input[type="text"]');
		await filterInput.fill('Fer');
		
		// Manually trigger input event to ensure Svelte binding updates
		await filterInput.dispatchEvent('input');

		// Wait for suggestions to appear
		const suggestions = attendeeFilter.locator('.suggestions');
		await expect(suggestions).toBeVisible({ timeout: 10000 });

		// Verify the suggestion contains our attendee
		const suggestionItem = suggestions.locator('.suggestion-item', {
			hasText: 'Fernando Gutierrez'
		});
		await expect(suggestionItem).toBeVisible();

		// Click the suggestion to apply the filter
		await suggestionItem.click();

		// Wait for the URL to update with the attendee search param
		await expect(page).toHaveURL(/attendeeSearch=Fernando/, { timeout: 10000 });

		// The filtered results should show our checked-out game
		await expect(helpers.tableRow(page, game.title).first()).toBeVisible({ timeout: 5000 });
	});

	test('no suggestions for < 2 chars: typing only 1 character shows no suggestions', async ({
		page,
		helpers
	}) => {
		// Create a game and checkout to establish an attendee record
		const game = await helpers.createGame(`${helpers.prefix}_NoSuggest`);
		await helpers.checkoutGame(game.title, 'Xavier', 'Thompson', '28');
		await helpers.checkinGame(game.title, '28');

		// Open checkout dialog on a new game
		const game2 = await helpers.createGame(`${helpers.prefix}_NoSuggest2`);
		await page.goto(`/library?search=${encodeURIComponent(game2.title)}`);
		const row = helpers.tableRow(page, game2.title).first();
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: 'Checkout' }).click();

		const dialog = page.locator('dialog.checkout-dialog');
		await expect(dialog).toBeVisible();

		// Type only 1 character
		const firstNameInput = dialog.locator('.attendee-autofill').first().locator('input[type="text"]');
		await firstNameInput.fill('X');

		// Wait a bit longer than the debounce (300ms) to ensure no suggestions appear
		await page.waitForTimeout(500);

		// Verify no suggestions dropdown is visible
		const suggestions = dialog.locator('.suggestions').first();
		await expect(suggestions).not.toBeVisible();
	});

	test('suggestion selection populates firstName, lastName, and idType fields in checkout dialog', async ({
		page,
		helpers
	}) => {
		// Create a game and checkout to establish an attendee with specific details
		const game1 = await helpers.createGame(`${helpers.prefix}_PopFields`);
		await helpers.checkoutGame(game1.title, 'Priscilla', 'Nakamura', '22');
		await helpers.checkinGame(game1.title, '22');

		// Open checkout dialog on another game
		const game2 = await helpers.createGame(`${helpers.prefix}_PopFields2`);
		await page.goto(`/library?search=${encodeURIComponent(game2.title)}`);
		const row = helpers.tableRow(page, game2.title).first();
		await expect(row).toBeVisible();
		await row.getByRole('button', { name: 'Checkout' }).click();

		const dialog = page.locator('dialog.checkout-dialog');
		await expect(dialog).toBeVisible();

		// Type in the last name field to trigger autofill from that field
		const lastNameInput = dialog.locator('.attendee-autofill').nth(1).locator('input[type="text"]');
		await lastNameInput.fill('Nak');

		// Wait for suggestions
		const suggestions = dialog.locator('.attendee-autofill').nth(1).locator('.suggestions');
		await expect(suggestions).toBeVisible({ timeout: 5000 });

		// Select the suggestion
		const suggestionItem = suggestions.locator('.suggestion-item', {
			hasText: 'Priscilla Nakamura'
		});
		await expect(suggestionItem).toBeVisible();
		await suggestionItem.click();

		// Verify firstName is populated
		const firstNameHidden = dialog.locator('input[name="attendeeFirstName"]');
		await expect(firstNameHidden).toHaveValue('Priscilla');

		// Verify lastName is populated
		const lastNameHidden = dialog.locator('input[name="attendeeLastName"]');
		await expect(lastNameHidden).toHaveValue('Nakamura');

		// Verify idType is populated (should not be empty)
		const idTypeSelect = dialog.locator('#checkout-idType');
		const idTypeValue = await idTypeSelect.inputValue();
		expect(idTypeValue).not.toBe('');
	});

	test.fixme('transactions page attendee filter: autofill suggestions appear', async ({
		page,
		helpers
	}) => {
		// Create a game and checkout to establish an attendee record and transaction
		const game = await helpers.createGame(`${helpers.prefix}_TxFilter`);
		await helpers.checkoutGame(game.title, 'Beatrice', 'Langford', '35');

		// Go to the transactions page
		await page.goto('/management/transactions');

		// Find the attendee autofill filter
		const attendeeFilter = page.locator('.attendee-autofill').first();
		const filterInput = attendeeFilter.locator('input[type="text"]');
		await filterInput.fill('Bea');
		await filterInput.dispatchEvent('input');

		// Wait for suggestions to appear
		const suggestions = attendeeFilter.locator('.suggestions');
		await expect(suggestions).toBeVisible({ timeout: 5000 });

		// Verify the suggestion contains our attendee
		const suggestionItem = suggestions.locator('.suggestion-item', {
			hasText: 'Beatrice Langford'
		});
		await expect(suggestionItem).toBeVisible();

		// Select the suggestion to apply the filter
		await suggestionItem.click();

		// Wait for the URL to update with the attendee name filter
		await expect(page).toHaveURL(/attendeeName=Beatrice/, { timeout: 10000 });

		// The filtered results should show our transaction
		await expect(helpers.tableRow(page, game.title).first()).toBeVisible({ timeout: 5000 });
	});
});
