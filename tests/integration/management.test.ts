import { test, expect } from './fixtures';

test.describe('Management Area', () => {
	test.describe('Landing Page', () => {
		test('displays summary counts and navigation cards', async ({ page }) => {
			await page.goto('/management');

			await expect(page.locator('h1')).toHaveText('Management');

			// Summary bar with 4 stat cards
			const summaryBar = page.locator('.summary-bar');
			await expect(summaryBar).toBeVisible();

			const statLabels = summaryBar.locator('.stat-label');
			await expect(statLabels.nth(0)).toHaveText('Total Games');
			await expect(statLabels.nth(1)).toHaveText('Available');
			await expect(statLabels.nth(2)).toHaveText('Checked Out');
			await expect(statLabels.nth(3)).toHaveText('Retired');

			// 4 navigation cards
			const navCards = page.locator('nav.nav-cards[aria-label="Management sections"]');
			await expect(navCards).toBeVisible();

			await expect(navCards.locator('a[href="/management/games"] .card-title')).toHaveText('Games');
			await expect(navCards.locator('a[href="/management/transactions"] .card-title')).toHaveText('Transactions');
			await expect(navCards.locator('a[href="/management/config"] .card-title')).toHaveText('Configuration');
			await expect(navCards.locator('a[href="/management/backup"] .card-title')).toHaveText('Backup');
		});
	});

	test.describe('Add Game Flow', () => {
		test('adds a new game and verifies it appears in the game list', async ({ page, helpers }) => {
			const title = `${helpers.prefix}_AddGame`;

			await page.goto('/management/games');
			await page.click('a[href="/management/games/new"]');
			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('h1')).toHaveText('Add Game');

			await page.fill('#title', title);
			await page.fill('#bggId', '36218');
			await page.selectOption('#gameType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games$/);

			// Verify the new game appears in the game list
			await page.goto(`/management/games?search=${title}`);
			await expect(helpers.tableRow(page, title).first()).toBeVisible();

			// Clean up: the game was created via UI, not helpers, so we need to
			// find its ID. We'll leave it — it has a unique prefix so it won't collide.
		});

		test('shows validation error when title is empty', async ({ page }) => {
			await page.goto('/management/games/new');

			await page.fill('#bggId', '12345');
			await page.selectOption('#gameType', 'standard');
			await page.click('button:has-text("Add Game")');

			await expect(page).toHaveURL(/\/management\/games\/new/);
			await expect(page.locator('.field-error')).toBeVisible();
		});
	});

	test.describe('Game List', () => {
		test('displays games with status indicators and action buttons', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_ListGame`);

			await page.goto(`/management/games?search=${helpers.prefix}_ListGame`);

			await expect(page.locator('h1')).toContainText('Games');

			const row = helpers.tableRow(page, game.title);
			await expect(row).toBeVisible();

			await expect(row.locator('.status-indicator')).toHaveText('Available');
			await expect(row.locator('.status-indicator')).toHaveClass(/available/);
			await expect(row.locator('button', { hasText: 'Retire' })).toBeVisible();
			await expect(row.locator('a', { hasText: 'Edit' })).toBeVisible();
		});
	});

	test.describe('Inline Retire and Restore', () => {
		test('retires a game inline and then restores it', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_RetireRestore`);

			await page.goto(`/management/games?search=${helpers.prefix}_RetireRestore`);

			// Retire
			const retireBtn = page.locator(`button[aria-label="Retire ${game.title}"]`).first();
			await retireBtn.click();

			await expect(page.getByText(`Retired "${game.title}"`)).toBeVisible();

			// Game disappears from default view (retired games are hidden by default)
			// Switch to retired filter to find it and restore
			await page.goto(`/management/games?search=${helpers.prefix}_RetireRestore&status=retired`);
			const restoreBtn = page.locator(`button[aria-label="Restore ${game.title}"]`).first();
			await expect(restoreBtn).toBeVisible();
			await restoreBtn.click();

			await expect(page.getByText('Restored')).toBeVisible();
		});
	});

	test.describe('Bulk Select and Retire', () => {
		test('selects multiple games and retires them via bulk action', async ({ page, helpers }) => {
			await helpers.createGame(`${helpers.prefix}_Bulk1`);
			await helpers.createGame(`${helpers.prefix}_Bulk2`);

			await page.goto(`/management/games?search=${helpers.prefix}_Bulk`);

			const checkboxes = page.locator('tbody tr input[type="checkbox"]');
			await checkboxes.nth(0).check();
			await checkboxes.nth(1).check();

			const bulkActions = page.locator('.bulk-actions');
			await expect(bulkActions).toBeVisible();
			await expect(bulkActions.locator('.selected-count')).toContainText('2 selected');

			await bulkActions.locator('button', { hasText: 'Retire Selected' }).click();

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Retire Selected Games"]');
			await expect(dialog).toBeVisible();
			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('Retired 2 game(s)')).toBeVisible();
		});
	});

	test.describe('Navigate to Edit Page', () => {
		test('clicking a game row navigates to the edit page', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_NavEdit`);

			await page.goto(`/management/games?search=${helpers.prefix}_NavEdit`);

			const row = helpers.tableRow(page, game.title);
			// Click on the game title text (not a button/link) to trigger row navigation
			await row.locator('.game-title').click();

			await expect(page).toHaveURL(/\/management\/games\/\d+/);
			await expect(page.locator('h1')).toContainText('Edit Game');
			await expect(page.locator('#title')).toHaveValue(game.title);
		});
	});

	test.describe('Select All Checkbox', () => {
		test('select all checkbox toggles all game selections', async ({ page, helpers }) => {
			await helpers.createGame(`${helpers.prefix}_SelAll1`);
			await helpers.createGame(`${helpers.prefix}_SelAll2`);

			await page.goto(`/management/games?search=${helpers.prefix}_SelAll`);

			const selectAll = page.locator('input[aria-label="Select all games"]');
			await selectAll.check();

			const bulkActions = page.locator('.bulk-actions');
			await expect(bulkActions).toBeVisible();
			await expect(bulkActions.locator('.selected-count')).toContainText('2 selected');

			await selectAll.uncheck();
			await expect(bulkActions).not.toBeVisible();
		});
	});
});
