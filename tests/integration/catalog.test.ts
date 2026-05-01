import { test, expect } from './fixtures';

test.describe('Catalog Page', () => {
	test('displays created games with titles and copy numbers', async ({ page, helpers }) => {
		// Create two copies of the same game (same bggId)
		const g1 = await helpers.createGame(`${helpers.prefix}_CatCopy`, { bggId: 70001 });
		const g2 = await helpers.createGame(`${helpers.prefix}_CatCopy`, { bggId: 70001 });

		await page.goto(`/catalog?search=${helpers.prefix}_CatCopy`);

		await expect(page.locator('h1')).toContainText('Catalog');

		// Both copies should be visible with copy numbers
		await expect(
			page.locator('.game-card', { hasText: `${helpers.prefix}_CatCopy (Copy #${g1.copyNumber})` })
		).toBeVisible();
		await expect(
			page.locator('.game-card', { hasText: `${helpers.prefix}_CatCopy (Copy #${g2.copyNumber})` })
		).toBeVisible();
	});

	test('created games show Available status indicator', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_StatusGame`);

		await page.goto(`/catalog?search=${helpers.prefix}_StatusGame`);

		const card = page.locator('.game-card', { hasText: `${helpers.prefix}_StatusGame` });
		await expect(card).toBeVisible();

		const status = card.locator('.status-indicator');
		await expect(status).toHaveText('Available');
		await expect(status).toHaveClass(/available/);
	});

	test('game type badges are correct for each game type', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_StdGame`, { gameType: 'standard' });
		await helpers.createGame(`${helpers.prefix}_PwGame`, { gameType: 'play_and_win' });
		await helpers.createGame(`${helpers.prefix}_PtGame`, { gameType: 'play_and_take' });

		await page.goto(`/catalog?search=${helpers.prefix}_`);

		const stdCard = page.locator('.game-card', { hasText: `${helpers.prefix}_StdGame` });
		await expect(stdCard.locator('.badge.standard')).toHaveText('Standard');

		const pwCard = page.locator('.game-card', { hasText: `${helpers.prefix}_PwGame` });
		await expect(pwCard.locator('.badge.play_and_win')).toHaveText('Play & Win');

		const ptCard = page.locator('.game-card', { hasText: `${helpers.prefix}_PtGame` });
		await expect(ptCard.locator('.badge.play_and_take')).toHaveText('Play & Take');
	});

	test('BGG links are present and correctly formatted', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_BggGame`, { bggId: 12345 });

		await page.goto(`/catalog?search=${helpers.prefix}_BggGame`);

		const link = page.locator('.game-card', { hasText: `${helpers.prefix}_BggGame` }).locator('a.bgg-link');
		await expect(link).toHaveAttribute('href', 'https://boardgamegeek.com/boardgame/12345');
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	test('filter by status: Available shows game, Checked Out hides it', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_FilterStatus`);

		await page.goto(`/catalog?search=${helpers.prefix}_FilterStatus&status=available`);
		await expect(page.locator('.game-card', { hasText: `${helpers.prefix}_FilterStatus` })).toBeVisible();

		await page.goto(`/catalog?search=${helpers.prefix}_FilterStatus&status=checked_out`);
		await expect(page.locator('.game-card', { hasText: `${helpers.prefix}_FilterStatus` })).toHaveCount(0);
	});

	test('filter by game type shows only matching games', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_PwOnly`, { gameType: 'play_and_win' });
		await helpers.createGame(`${helpers.prefix}_StdOnly`, { gameType: 'standard' });

		await page.goto(`/catalog?search=${helpers.prefix}_&gameType=play_and_win`);

		await expect(page.locator('.game-card', { hasText: `${helpers.prefix}_PwOnly` })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: `${helpers.prefix}_StdOnly` })).toHaveCount(0);
	});

	test('title search filters to matching games', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_SearchHit`);
		await helpers.createGame(`${helpers.prefix}_SearchMiss`);

		await page.goto('/catalog');
		await page.locator('input[type="search"]').fill(`${helpers.prefix}_SearchHit`);
		await page.waitForURL(new RegExp(`search=${helpers.prefix}_SearchHit`), { timeout: 5000 });

		await expect(page.locator('.game-card', { hasText: `${helpers.prefix}_SearchHit` })).toBeVisible();
		await expect(page.locator('.game-card', { hasText: `${helpers.prefix}_SearchMiss` })).toHaveCount(0);
	});

	test('empty state when no games match search', async ({ page }) => {
		await page.goto('/catalog');
		await page.locator('input[type="search"]').fill('ZZZZZ_no_match_ever');
		await page.waitForURL(/search=ZZZZZ_no_match_ever/, { timeout: 5000 });

		await expect(page.locator('.empty-message')).toHaveText('No games found matching your filters.');
	});
});
