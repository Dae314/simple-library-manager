import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Helper: checkout a game by name with the given attendee info.
 * Assumes the game is visible on the /checkout page.
 */
async function checkoutGame(
	page: Page,
	gameName: string,
	firstName: string,
	lastName: string,
	weight: string
) {
	await page.goto('/checkout');

	const gameCard = page.locator('.game-card', { hasText: gameName }).first();
	await expect(gameCard).toBeVisible();
	await gameCard.getByRole('button', { name: 'Checkout' }).click();

	const checkoutForm = page.locator('section[aria-label="Checkout form"]');
	await expect(checkoutForm).toBeVisible();

	await checkoutForm.locator('#attendeeFirstName').fill(firstName);
	await checkoutForm.locator('#attendeeLastName').fill(lastName);
	await checkoutForm.locator('#idType').selectOption({ index: 1 });
	await checkoutForm.locator('#checkoutWeight').fill(weight);
	await checkoutForm.getByRole('button', { name: 'Confirm Checkout' }).click();

	await expect(page.getByText('Game checked out successfully!')).toBeVisible();
}

test.describe('Play & Win and Play & Take Flows', () => {
	test('play_and_win checkin shows raffle reminder', async ({ page }) => {
		// Checkout Codenames (play_and_win game)
		await checkoutGame(page, 'Codenames', 'Raffle', 'Tester', '15.0');

		// Navigate to checkin
		await page.goto('/checkin');

		// Select Codenames and click Check In
		const checkinCard = page.locator('.game-card', { hasText: 'Codenames' }).first();
		await expect(checkinCard).toBeVisible();
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		// Verify the raffle reminder is visible
		const raffleReminder = checkinForm.locator('.raffle-reminder');
		await expect(raffleReminder).toBeVisible();
		await expect(raffleReminder).toContainText('Play & Win');
		await expect(raffleReminder).toContainText('raffle entries');
		await expect(raffleReminder).toContainText('Raffle Tester');

		// Complete the checkin normally
		await checkinForm.locator('#checkinWeight').fill('15.0');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		// Verify success
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('play_and_take — attendee takes the game (retires it)', async ({ page }) => {
		// Checkout 7 Wonders (play_and_take game)
		await checkoutGame(page, '7 Wonders', 'Take', 'Tester', '25.0');

		// Navigate to checkin
		await page.goto('/checkin');

		// Select 7 Wonders and click Check In
		const checkinCard = page.locator('.game-card', { hasText: '7 Wonders' }).first();
		await expect(checkinCard).toBeVisible();
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		// Enter weight and submit
		await checkinForm.locator('#checkinWeight').fill('25.0');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		// The Play & Take dialog should appear
		const dialog = page.locator('dialog.confirm-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.dialog-title')).toHaveText('Play & Take');
		await expect(dialog.locator('.dialog-message')).toContainText('take this game home');

		// Click "Yes, take it"
		await dialog.locator('.btn-confirm').click();

		// Verify success toast
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Navigate to checkout and verify 7 Wonders is NOT in the available games list (retired)
		await page.goto('/checkout');
		await expect(page.locator('.game-card', { hasText: '7 Wonders' })).toHaveCount(0);
	});

	test('play_and_take — attendee returns the game (normal checkin)', async ({ page }) => {
		// Add a new play_and_take game via management to avoid dependency on previous test state
		await page.goto('/management/games/new');
		await page.fill('#title', 'TestTakeGame');
		await page.fill('#bggId', '99999');
		await page.selectOption('#gameType', 'play_and_take');
		await page.click('button:has-text("Add Game")');
		await expect(page).toHaveURL(/\/management$/);

		// Checkout the new game
		await checkoutGame(page, 'TestTakeGame', 'Return', 'Tester', '20.0');

		// Navigate to checkin
		await page.goto('/checkin');

		// Select the game and click Check In
		const checkinCard = page.locator('.game-card', { hasText: 'TestTakeGame' }).first();
		await expect(checkinCard).toBeVisible();
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		// Enter weight and submit
		await checkinForm.locator('#checkinWeight').fill('20.0');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		// The Play & Take dialog should appear
		const dialog = page.locator('dialog.confirm-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.dialog-title')).toHaveText('Play & Take');

		// Click "No, return it"
		await dialog.locator('.btn-cancel').click();

		// Verify success toast
		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Navigate to checkout and verify the game IS still in the available games list
		await page.goto('/checkout');
		await expect(page.locator('.game-card', { hasText: 'TestTakeGame' })).toBeVisible();
	});
});
