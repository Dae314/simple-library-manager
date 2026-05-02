import { test, expect } from './fixtures';

test.describe('Edit Game and Status Toggle', () => {
	test('navigate to edit page from game list', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_EditNav`, { bggId: 55555 });

		await page.goto(`/management/games?search=${helpers.prefix}_EditNav`);

		const row = page.locator('.game-row', { hasText: game.title });
		await row.locator('a', { hasText: 'Edit' }).click();

		await expect(page).toHaveURL(/\/management\/games\/\d+/);
		await expect(page.locator('h1')).toContainText('Edit Game');

		await expect(page.locator('#title')).toHaveValue(game.title);
		await expect(page.locator('#bggId')).toHaveValue('55555');

		// copy-number badge is hidden for single-copy games
		await expect(page.locator('.copy-number')).toHaveCount(0);
		await expect(page.locator('.status-badge')).toBeVisible();
		await expect(page.locator('a', { hasText: 'View on BGG' })).toBeVisible();
	});

	test('edit game title', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_EditTitle`);
		const newTitle = `${helpers.prefix}_Renamed`;

		await page.goto(`/management/games?search=${helpers.prefix}_EditTitle`);

		const row = page.locator('.game-row', { hasText: game.title });
		await row.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		await page.locator('#title').fill(newTitle);
		await page.click('button:has-text("Save Changes")');

		await expect(page).toHaveURL(/\/management$/);

		await page.goto(`/management/games?search=${newTitle}`);
		await expect(page.locator('.game-card', { hasText: newTitle })).toBeVisible();
	});

	test('edit BGG ID', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_EditBgg`);

		await page.goto(`/management/games?search=${helpers.prefix}_EditBgg`);

		const row = page.locator('.game-row', { hasText: game.title });
		await row.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		await page.locator('#bggId').fill('88888');
		await page.click('button:has-text("Save Changes")');

		await expect(page).toHaveURL(/\/management$/);
	});

	test('edit validation: empty title shows error', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_EditVal`);

		await page.goto(`/management/games?search=${helpers.prefix}_EditVal`);

		const row = page.locator('.game-row', { hasText: game.title });
		await row.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		await page.locator('#title').fill('');
		await page.click('button:has-text("Save Changes")');

		await expect(page).toHaveURL(/\/management\/games\/\d+/);
		await expect(page.locator('.field-error')).toBeVisible();
	});

	test('status toggle: mark as checked out', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_Toggle`);

		await page.goto(`/management/games?search=${helpers.prefix}_Toggle`);

		const row = page.locator('.game-row', { hasText: game.title });
		await row.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		await expect(page.locator('.status-badge')).toHaveClass(/status-available/);

		await page.click('.btn-toggle:has-text("Mark as Checked Out")');

		await expect(page.getByText('Game status updated successfully!')).toBeVisible();
		await expect(page.locator('.status-badge')).toHaveClass(/status-checked-out/);
	});

	test('status toggle creates corrective transaction', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_ToggleTx`);

		await page.goto(`/management/games?search=${helpers.prefix}_ToggleTx`);

		const row = page.locator('.game-row', { hasText: game.title });
		await row.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		await page.click('.btn-toggle:has-text("Mark as Checked Out")');
		await expect(page.getByText('Game status updated successfully!')).toBeVisible();

		await page.goto(`/management/transactions?gameTitle=${helpers.prefix}_ToggleTx`);
		await expect(page.locator('.correction-badge').first()).toBeVisible();
	});

	test('status toggle: mark as available after checked out', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_ToggleBack`);

		await page.goto(`/management/games?search=${helpers.prefix}_ToggleBack`);

		const row = page.locator('.game-row', { hasText: game.title });
		await row.locator('a', { hasText: 'Edit' }).click();
		await expect(page).toHaveURL(/\/management\/games\/\d+/);

		// Mark as checked out
		await page.click('.btn-toggle:has-text("Mark as Checked Out")');
		await expect(page.getByText('Game status updated successfully!')).toBeVisible();
		await expect(page.locator('.status-badge')).toHaveClass(/status-checked-out/);

		// Mark as available again
		await page.click('.btn-toggle:has-text("Mark as Available")');
		await expect(page.getByText('Game status updated successfully!')).toBeVisible();
		await expect(page.locator('.status-badge')).toHaveClass(/status-available/);
	});
});
