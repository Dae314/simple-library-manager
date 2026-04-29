import { test, expect } from './fixtures';

test.describe('Checkout → Checkin Flow', () => {
	test('happy path: checkout a game, then check it back in', async ({ page }) => {
		// --- Checkout ---
		await page.goto('/checkout');

		// Find a Catan game card and click its Checkout button
		const catanCard = page.locator('.game-card', { hasText: 'Catan' }).first();
		await expect(catanCard).toBeVisible();
		await catanCard.getByRole('button', { name: 'Checkout' }).click();

		// The checkout form panel should appear
		const checkoutForm = page.locator('section[aria-label="Checkout form"]');
		await expect(checkoutForm).toBeVisible();

		// Fill in attendee info
		await checkoutForm.locator('#attendeeFirstName').fill('Jane');
		await checkoutForm.locator('#attendeeLastName').fill('Doe');
		await checkoutForm.locator('#idType').selectOption({ index: 1 }); // first real option after placeholder
		await checkoutForm.locator('#checkoutWeight').fill('32.5');

		// Submit checkout
		await checkoutForm.getByRole('button', { name: 'Confirm Checkout' }).click();

		// Verify success toast
		await expect(page.getByText('Game checked out successfully!')).toBeVisible();

		// --- Checkin ---
		await page.goto('/checkin');

		// The checked-out Catan game should appear with attendee name
		const checkinCard = page.locator('.game-card', { hasText: 'Catan' }).first();
		await expect(checkinCard).toBeVisible();
		await expect(checkinCard.locator('.attendee-name')).toHaveText('Jane Doe');

		// Click Check In
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		// The checkin form panel should appear
		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		// Verify ID return reminder shows attendee name and ID type
		const idReminder = checkinForm.locator('.id-reminder');
		await expect(idReminder).toBeVisible();
		await expect(idReminder).toContainText('Jane Doe');

		// Enter checkin weight (same as checkout — no warning expected)
		await checkinForm.locator('#checkinWeight').fill('32.5');

		// Submit checkin
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		// Verify success toast
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Verify the game is back on the checkout page as available
		await page.goto('/checkout');
		const availableCatan = page.locator('.game-card', { hasText: 'Catan' }).first();
		await expect(availableCatan).toBeVisible();
	});

	test('weight warning is displayed when checkin weight differs beyond tolerance', async ({ page }) => {
		// --- Checkout a game with weight 32.5 ---
		await page.goto('/checkout');

		const gameCard = page.locator('.game-card', { hasText: 'Catan' }).first();
		await gameCard.getByRole('button', { name: 'Checkout' }).click();

		const checkoutForm = page.locator('section[aria-label="Checkout form"]');
		await expect(checkoutForm).toBeVisible();

		await checkoutForm.locator('#attendeeFirstName').fill('Bob');
		await checkoutForm.locator('#attendeeLastName').fill('Smith');
		await checkoutForm.locator('#idType').selectOption({ index: 1 });
		await checkoutForm.locator('#checkoutWeight').fill('32.5');
		await checkoutForm.getByRole('button', { name: 'Confirm Checkout' }).click();

		await expect(page.getByText('Game checked out successfully!')).toBeVisible();

		// --- Checkin with weight 30.0 (difference 2.5 > tolerance 0.5) ---
		await page.goto('/checkin');

		const checkinCard = page.locator('.game-card', { hasText: 'Catan' }).first();
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		await checkinForm.locator('#checkinWeight').fill('30.0');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		// Checkin should still succeed (warning is non-blocking)
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Weight warning should be displayed
		const weightWarning = page.locator('.weight-warning');
		await expect(weightWarning).toBeVisible();
		await expect(weightWarning).toContainText('Weight Discrepancy Detected');
	});

	test('validation errors appear when submitting checkout without required fields', async ({ page }) => {
		await page.goto('/checkout');

		// Select a game to open the form
		const gameCard = page.locator('.game-card', { hasText: 'Catan' }).first();
		await gameCard.getByRole('button', { name: 'Checkout' }).click();

		const checkoutForm = page.locator('section[aria-label="Checkout form"]');
		await expect(checkoutForm).toBeVisible();

		// Clear any pre-filled values and submit empty form
		await checkoutForm.locator('#attendeeFirstName').fill('');
		await checkoutForm.locator('#attendeeLastName').fill('');
		// Leave ID type on placeholder "Select ID type..."
		// Leave weight empty

		await checkoutForm.getByRole('button', { name: 'Confirm Checkout' }).click();

		// Verify validation error messages appear
		await expect(checkoutForm.locator('.field-error').first()).toBeVisible();
	});
});
