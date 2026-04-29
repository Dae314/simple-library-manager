import { test, expect } from './fixtures';

test.describe('Catalog Page', () => {
	test('displays all seed games with titles and copy numbers', async ({ page }) => {
		await page.goto('/catalog');

		await expect(page.locator('h1')).toHaveText('Catalog');

		// There are 10 seed games total. Verify key titles are visible.
		// Catan has 2 copies, so we expect copy numbers
		await expect(page.locator('.game-card', { hasText: 'Catan (Copy #1)' })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: 'Catan (Copy #2)' })).toBeVisible();

		// Ticket to Ride also has 2 copies
		await expect(page.locator('.game-card', { hasText: 'Ticket to Ride (Copy #1)' })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: 'Ticket to Ride (Copy #2)' })).toBeVisible();

		// Single-copy games
		await expect(page.locator('.game-card', { hasText: 'Pandemic' })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: 'Azul' })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: 'Codenames' })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: 'Wingspan' })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: '7 Wonders' })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: 'Splendor' })).toBeVisible();

		// Verify total count shown in pagination
		await expect(page.locator('.pagination .total')).toContainText('10');
	});

	test('all seed games show Available status indicator', async ({ page }) => {
		await page.goto('/catalog');

		const statusIndicators = page.locator('.status-indicator');
		const count = await statusIndicators.count();
		expect(count).toBe(10);

		// Every status indicator should say "Available"
		for (let i = 0; i < count; i++) {
			await expect(statusIndicators.nth(i)).toHaveText('Available');
			await expect(statusIndicators.nth(i)).toHaveClass(/available/);
		}
	});

	test('game type badges are correct for each game type', async ({ page }) => {
		await page.goto('/catalog');

		// Codenames is play_and_win
		const codenamesCard = page.locator('.game-card', { hasText: 'Codenames' });
		await expect(codenamesCard.locator('.badge.play_and_win')).toHaveText('Play & Win');

		// 7 Wonders is play_and_take
		const wondersCard = page.locator('.game-card', { hasText: '7 Wonders' });
		await expect(wondersCard.locator('.badge.play_and_take')).toHaveText('Play & Take');

		// Catan is standard
		const catanCard = page.locator('.game-card', { hasText: 'Catan (Copy #1)' });
		await expect(catanCard.locator('.badge.standard')).toHaveText('Standard');
	});

	test('BGG links are present and correctly formatted', async ({ page }) => {
		await page.goto('/catalog');

		// Catan (BGG ID 13)
		const catanLink = page.locator('.game-card', { hasText: 'Catan (Copy #1)' }).locator('a.bgg-link');
		await expect(catanLink).toHaveAttribute('href', 'https://boardgamegeek.com/boardgame/13');
		await expect(catanLink).toHaveAttribute('target', '_blank');
		await expect(catanLink).toHaveAttribute('rel', 'noopener noreferrer');

		// Codenames (BGG ID 178900)
		const codenamesLink = page.locator('.game-card', { hasText: 'Codenames' }).locator('a.bgg-link');
		await expect(codenamesLink).toHaveAttribute('href', 'https://boardgamegeek.com/boardgame/178900');

		// 7 Wonders (BGG ID 68448)
		const wondersLink = page.locator('.game-card', { hasText: '7 Wonders' }).locator('a.bgg-link');
		await expect(wondersLink).toHaveAttribute('href', 'https://boardgamegeek.com/boardgame/68448');
	});

	test('filter by status: Available shows all, Checked Out shows empty', async ({ page }) => {
		await page.goto('/catalog');

		// Select "Available" — all 10 games should still show
		await page.locator('select[aria-label="Filter by status"]').selectOption('available');
		await page.waitForURL(/status=available/);
		await expect(page.locator('.game-card')).toHaveCount(10);

		// Select "Checked Out" — no games are checked out initially
		await page.locator('select[aria-label="Filter by status"]').selectOption('checked_out');
		await page.waitForURL(/status=checked_out/);
		await expect(page.locator('.empty-message')).toHaveText('No games found matching your filters.');
	});

	test('filter by game type: Play & Win shows only Codenames', async ({ page }) => {
		await page.goto('/catalog');

		await page.locator('select[aria-label="Filter by game type"]').selectOption('play_and_win');
		await page.waitForURL(/gameType=play_and_win/);

		const cards = page.locator('.game-card');
		await expect(cards).toHaveCount(1);
		await expect(cards.first()).toContainText('Codenames');
	});

	test('filter by game type: Play & Take shows only 7 Wonders', async ({ page }) => {
		await page.goto('/catalog');

		await page.locator('select[aria-label="Filter by game type"]').selectOption('play_and_take');
		await page.waitForURL(/gameType=play_and_take/);

		const cards = page.locator('.game-card');
		await expect(cards).toHaveCount(1);
		await expect(cards.first()).toContainText('7 Wonders');
	});

	test('title search filters to matching games', async ({ page }) => {
		await page.goto('/catalog');

		// Type "Catan" in the search field
		await page.locator('input[type="search"]').fill('Catan');

		// Wait for debounce (300ms) + navigation
		await page.waitForURL(/search=Catan/, { timeout: 5000 });

		const cards = page.locator('.game-card');
		await expect(cards).toHaveCount(2); // Catan Copy #1 and Copy #2
		await expect(cards.nth(0)).toContainText('Catan');
		await expect(cards.nth(1)).toContainText('Catan');
	});

	test('empty state when no games match filters', async ({ page }) => {
		await page.goto('/catalog');

		// Search for a nonexistent game
		await page.locator('input[type="search"]').fill('ZZZZZ');
		await page.waitForURL(/search=ZZZZZ/, { timeout: 5000 });

		await expect(page.locator('.empty-message')).toHaveText('No games found matching your filters.');
		await expect(page.locator('.game-card')).toHaveCount(0);
	});
});
