import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Helper: checkout a game via the checkout UI.
 */
async function checkoutGame(
	page: Page,
	gameName: string,
	firstName: string,
	lastName: string,
	weight: string
) {
	await page.goto('/checkout');
	const card = page.locator('.game-card', { hasText: gameName }).first();
	await card.getByRole('button', { name: 'Checkout' }).click();

	const form = page.locator('section[aria-label="Checkout form"]');
	await expect(form).toBeVisible();
	await form.locator('#attendeeFirstName').fill(firstName);
	await form.locator('#attendeeLastName').fill(lastName);
	await form.locator('#idType').selectOption({ index: 1 });
	await form.locator('#checkoutWeight').fill(weight);
	await form.getByRole('button', { name: 'Confirm Checkout' }).click();
	await expect(page.getByText('Game checked out successfully!')).toBeVisible();
}

/**
 * Helper: checkin a game via the checkin UI.
 */
async function checkinGame(page: Page, gameName: string, weight: string) {
	await page.goto('/checkin');
	const card = page.locator('.game-card', { hasText: gameName }).first();
	await card.getByRole('button', { name: 'Check In' }).click();

	const form = page.locator('section[aria-label="Check in form"]');
	await expect(form).toBeVisible();
	await form.locator('#checkinWeight').fill(weight);
	await form.getByRole('button', { name: 'Confirm Check In' }).click();
	await expect(page.getByText('Game checked in successfully!')).toBeVisible();
}

test.describe('Transaction Log and Reversals', () => {
	test('transaction log shows entries after checkout', async ({ page }) => {
		// Checkout a game first
		await checkoutGame(page, 'Pandemic', 'Alice', 'Test', '30');

		// Navigate to transaction log
		await page.goto('/management/transactions');
		await expect(page.locator('h1')).toHaveText('Transaction Log');

		// Verify a checkout transaction card appears
		const txCard = page.locator('.transaction-card', { hasText: 'Pandemic' }).first();
		await expect(txCard).toBeVisible();
		await expect(txCard.locator('.type-badge.checkout')).toHaveText('Checkout');
		await expect(txCard.locator('.card-details')).toContainText('Alice Test');
	});

	test('transaction log shows both checkout and checkin entries', async ({ page }) => {
		// Checkout then checkin
		await checkoutGame(page, 'Azul', 'Bob', 'Tester', '25');
		await checkinGame(page, 'Azul', '25');

		// Navigate to transaction log
		await page.goto('/management/transactions');

		// Both checkout and checkin cards for Azul should appear
		const azulCards = page.locator('.transaction-card', { hasText: 'Azul' });
		await expect(azulCards).toHaveCount(2);

		// Verify we have one checkout and one checkin badge
		const checkoutBadge = page.locator('.transaction-card', { hasText: 'Azul' }).locator('.type-badge.checkout');
		const checkinBadge = page.locator('.transaction-card', { hasText: 'Azul' }).locator('.type-badge.checkin');
		await expect(checkoutBadge).toHaveCount(1);
		await expect(checkinBadge).toHaveCount(1);
	});

	test('filter by transaction type', async ({ page }) => {
		// Create a checkout transaction
		await checkoutGame(page, 'Splendor', 'Carol', 'Filter', '20');

		await page.goto('/management/transactions');

		// Filter by Checkout type using the select dropdown
		const typeSelect = page.locator('#filter-type');
		await typeSelect.selectOption('checkout');

		// Wait for navigation/filter to apply
		await page.waitForURL(/type=checkout/);

		// All visible type badges should be checkout
		const typeBadges = page.locator('.transaction-list .type-badge');
		const count = await typeBadges.count();
		expect(count).toBeGreaterThan(0);
		for (let i = 0; i < count; i++) {
			await expect(typeBadges.nth(i)).toHaveClass(/checkout/);
		}

		// Filter by Checkin type
		await typeSelect.selectOption('checkin');
		await page.waitForURL(/type=checkin/);

		// If there are checkin entries, they should all be checkin type
		const checkinBadges = page.locator('.transaction-list .type-badge');
		const checkinCount = await checkinBadges.count();
		if (checkinCount > 0) {
			for (let i = 0; i < checkinCount; i++) {
				await expect(checkinBadges.nth(i)).toHaveClass(/checkin/);
			}
		}
	});

	test('filter by game title', async ({ page }) => {
		// Ensure we have a transaction for Splendor
		await checkoutGame(page, 'Wingspan', 'Dave', 'Search', '28');

		await page.goto('/management/transactions');

		// Type in the game title filter
		const gameTitleInput = page.locator('#filter-gameTitle');
		await gameTitleInput.fill('Wingspan');

		// Wait for filter to apply via URL
		await page.waitForURL(/gameTitle=Wingspan/);

		// All visible game titles should contain "Wingspan"
		const gameTitles = page.locator('.transaction-list .game-title');
		const count = await gameTitles.count();
		expect(count).toBeGreaterThan(0);
		for (let i = 0; i < count; i++) {
			await expect(gameTitles.nth(i)).toContainText('Wingspan');
		}
	});

	test('reverse a checkout', async ({ page }) => {
		// Checkout a game
		await checkoutGame(page, 'Catan', 'Eve', 'Reverse', '35');

		// Navigate to transaction log
		await page.goto('/management/transactions');

		// Find the checkout transaction for Catan with attendee Eve and click reverse
		const txCard = page
			.locator('.transaction-card', { hasText: 'Catan' })
			.filter({ hasText: 'Eve Reverse' })
			.filter({ has: page.locator('.type-badge.checkout') })
			.first();
		await expect(txCard).toBeVisible();

		await txCard.locator('.btn-reverse').click();

		// Verify success toast
		await expect(page.getByText('Checkout reversed successfully')).toBeVisible();

		// After page updates, a corrective transaction should appear with correction badge
		const correctionBadge = page.locator('.transaction-card', { hasText: 'Catan' }).locator('.correction-badge');
		await expect(correctionBadge.first()).toBeVisible();

		// Corrective transactions should not have reversal buttons
		const correctionCard = page
			.locator('.transaction-card', { hasText: 'Catan' })
			.filter({ has: page.locator('.correction-badge') })
			.first();
		await expect(correctionCard.locator('.btn-reverse')).toHaveCount(0);

		// Verify the game is back to available on the checkout page
		await page.goto('/checkout');
		const availableCatan = page.locator('.game-card', { hasText: 'Catan' });
		await expect(availableCatan.first()).toBeVisible();
	});

	test('reverse a checkin', async ({ page }) => {
		// Checkout and checkin a game
		await checkoutGame(page, 'Catan', 'Frank', 'Undo', '33');
		await checkinGame(page, 'Catan', '33');

		// Navigate to transaction log
		await page.goto('/management/transactions');

		// Find the checkin transaction for Catan with attendee Frank and click reverse
		const txCard = page
			.locator('.transaction-card', { hasText: 'Catan' })
			.filter({ hasText: 'Frank Undo' })
			.filter({ has: page.locator('.type-badge.checkin') })
			.first();
		await expect(txCard).toBeVisible();

		await txCard.locator('.btn-reverse').click();

		// Verify success toast
		await expect(page.getByText('Checkin reversed successfully')).toBeVisible();

		// A corrective transaction should appear
		const correctionBadge = page
			.locator('.transaction-card', { hasText: 'Catan' })
			.locator('.correction-badge');
		await expect(correctionBadge.first()).toBeVisible();
	});
});
