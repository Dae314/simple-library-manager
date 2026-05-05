import { test, expect } from './fixtures';

test.describe('Library Page — Catalog Browsing', () => {
	test('displays created games with titles and copy numbers', async ({ page, helpers }) => {
		// Create two copies of the same game (same bggId)
		const g1 = await helpers.createGame(`${helpers.prefix}_CatCopy`, { bggId: 70001 });
		const g2 = await helpers.createGame(`${helpers.prefix}_CatCopy`, { bggId: 70001 });

		await page.goto(`/library?search=${helpers.prefix}_CatCopy`);

		await expect(page.locator('h1')).toContainText('Library');

		// Both copies should be visible with copy numbers
		await expect(
			helpers.tableRow(page, `${helpers.prefix}_CatCopy (Copy #${g1.copyNumber})`)
		).toBeVisible();
		await expect(
			helpers.tableRow(page, `${helpers.prefix}_CatCopy (Copy #${g2.copyNumber})`)
		).toBeVisible();
	});

	test('created games show Available status indicator', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_StatusGame`);

		await page.goto(`/library?search=${helpers.prefix}_StatusGame`);

		const row = helpers.tableRow(page, `${helpers.prefix}_StatusGame`);
		await expect(row).toBeVisible();

		const status = row.locator('.status-indicator');
		await expect(status).toHaveText('Available');
		await expect(status).toHaveClass(/available/);
	});

	test('game type badges are correct for each game type', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_StdGame`, { gameType: 'standard' });
		await helpers.createGame(`${helpers.prefix}_PwGame`, { gameType: 'play_and_win' });
		await helpers.createGame(`${helpers.prefix}_PtGame`, { gameType: 'play_and_take' });

		await page.goto(`/library?search=${helpers.prefix}_`);

		const stdRow = helpers.tableRow(page, `${helpers.prefix}_StdGame`);
		await expect(stdRow.locator('.badge.standard')).toHaveText('Standard');

		const pwRow = helpers.tableRow(page, `${helpers.prefix}_PwGame`);
		await expect(pwRow.locator('.badge.play_and_win')).toHaveText('Play & Win');

		const ptRow = helpers.tableRow(page, `${helpers.prefix}_PtGame`);
		await expect(ptRow.locator('.badge.play_and_take')).toHaveText('Play & Take');
	});

	test('BGG links are present and correctly formatted', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_BggGame`, { bggId: 12345 });

		await page.goto(`/library?search=${helpers.prefix}_BggGame`);

		const link = helpers.tableRow(page, `${helpers.prefix}_BggGame`).locator('a.bgg-link');
		await expect(link).toHaveAttribute('href', 'https://boardgamegeek.com/boardgame/12345');
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	test('filter by status: Available shows game, Checked Out hides it', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_FilterStatus`);

		await page.goto(`/library?search=${helpers.prefix}_FilterStatus&status=available`);
		await expect(helpers.tableRow(page, `${helpers.prefix}_FilterStatus`)).toBeVisible();

		await page.goto(`/library?search=${helpers.prefix}_FilterStatus&status=checked_out`);
		await expect(helpers.tableRow(page, `${helpers.prefix}_FilterStatus`)).toHaveCount(0);
	});

	test('filter by game type shows only matching games', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_PwOnly`, { gameType: 'play_and_win' });
		await helpers.createGame(`${helpers.prefix}_StdOnly`, { gameType: 'standard' });

		await page.goto(`/library?search=${helpers.prefix}_&gameType=play_and_win`);

		await expect(helpers.tableRow(page, `${helpers.prefix}_PwOnly`)).toBeVisible();
		await expect(helpers.tableRow(page, `${helpers.prefix}_StdOnly`)).toHaveCount(0);
	});

	test('title search filters to matching games', async ({ page, helpers }) => {
		await helpers.createGame(`${helpers.prefix}_SearchHit`);
		await helpers.createGame(`${helpers.prefix}_SearchMiss`);

		// Use URL-based search for reliable server-side filtering
		await page.goto(`/library?search=${encodeURIComponent(`${helpers.prefix}_SearchHit`)}`);

		await expect(helpers.tableRow(page, `${helpers.prefix}_SearchMiss`)).toHaveCount(0);
		await expect(helpers.tableRow(page, `${helpers.prefix}_SearchHit`)).toBeVisible();
	});

	test('attendee name search filters to matching checked-out games', async ({ page, helpers }) => {
		const gameName = `${helpers.prefix}_AttSearch`;
		await helpers.createGame(gameName);

		// Check out the game so it has an attendee
		await helpers.checkoutGame(gameName, 'UniqueFirstXYZ', 'UniqueLastXYZ', '3.0');

		// Navigate to library with attendee search via URL to avoid debounce issues
		await page.goto(`/library?attendeeSearch=UniqueFirstXYZ`);
		await page.locator('table').waitFor({ state: 'visible', timeout: 10_000 });

		// The checked-out game with matching attendee should appear
		await expect(helpers.tableRow(page, gameName)).toBeVisible({ timeout: 10_000 });
	});

	test('empty state when no games match search', async ({ page }) => {
		// Use URL-based search to avoid debounce timing issues
		await page.goto('/library?search=ZZZZZ_no_match_ever');

		await expect(page.locator('.empty-message')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('.empty-message')).toHaveText('No games found matching your filters.');
	});
});
