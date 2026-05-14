import { test, expect } from './fixtures';
import path from 'node:path';
import fs from 'node:fs';

const TMP_DIR = path.join(process.cwd(), 'tests', 'integration');

test.describe('Shelf Category', () => {
	test('create game with shelf category via management form', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_ShelfNew`;

		await page.goto('/management/games/new');
		await page.locator('#title').fill(title);
		await page.locator('#bggId').fill('88001');
		await page.locator('#shelfCategory').selectOption('family');
		await page.getByRole('button', { name: 'Add Game' }).click();

		await expect(page.getByText('Game added successfully')).toBeVisible({ timeout: 10_000 });

		// Verify the game appears with the correct shelf category
		await page.goto(`/management/games?search=${encodeURIComponent(title)}`);
		const row = helpers.tableRow(page, title).first();
		await expect(row).toBeVisible();
		await expect(row).toContainText('Family');
	});

	test('edit game shelf category', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_ShelfEdit`;
		const game = await helpers.createGame(title, { bggId: 88002, shelfCategory: 'family' });

		await page.goto(`/management/games/${game.id}`);
		await expect(page.locator('#shelfCategory')).toHaveValue('family');

		// Change to "small"
		await page.locator('#shelfCategory').selectOption('small');
		await page.getByRole('button', { name: 'Save Changes' }).click();

		await expect(page.getByText('Game updated successfully')).toBeVisible({ timeout: 10_000 });

		// Verify the change persisted
		await page.goto(`/management/games/${game.id}`);
		await expect(page.locator('#shelfCategory')).toHaveValue('small');
	});

	test('filter by shelf category on library page', async ({ page, helpers }) => {
		const familyTitle = `${helpers.prefix}_ShelfFam`;
		const smallTitle = `${helpers.prefix}_ShelfSml`;
		const standardTitle = `${helpers.prefix}_ShelfStd`;

		await helpers.createGame(familyTitle, { bggId: 88010, shelfCategory: 'family' });
		await helpers.createGame(smallTitle, { bggId: 88011, shelfCategory: 'small' });
		await helpers.createGame(standardTitle, { bggId: 88012, shelfCategory: 'standard' });

		// Filter by "family" shelf category
		await page.goto(`/library?search=${helpers.prefix}_Shelf&shelfCategory=family`);
		await expect(helpers.tableRow(page, familyTitle).first()).toBeVisible();
		await expect(helpers.tableRow(page, smallTitle)).toHaveCount(0);
		await expect(helpers.tableRow(page, standardTitle)).toHaveCount(0);

		// Filter by "small" shelf category
		await page.goto(`/library?search=${helpers.prefix}_Shelf&shelfCategory=small`);
		await expect(helpers.tableRow(page, smallTitle).first()).toBeVisible();
		await expect(helpers.tableRow(page, familyTitle)).toHaveCount(0);
		await expect(helpers.tableRow(page, standardTitle)).toHaveCount(0);
	});

	test('sort by shelf category on library page', async ({ page, helpers }) => {
		const familyTitle = `${helpers.prefix}_SortFam`;
		const smallTitle = `${helpers.prefix}_SortSml`;
		const standardTitle = `${helpers.prefix}_SortStd`;

		await helpers.createGame(familyTitle, { bggId: 88020, shelfCategory: 'family' });
		await helpers.createGame(smallTitle, { bggId: 88021, shelfCategory: 'small' });
		await helpers.createGame(standardTitle, { bggId: 88022, shelfCategory: 'standard' });

		// Sort by shelf_category ascending
		await page.goto(`/library?search=${helpers.prefix}_Sort&sortField=shelf_category&sortDir=asc`);

		const rows = page.locator('tbody tr');
		await expect(rows.first()).toBeVisible();

		// Verify that sorting is applied (all 3 games should be visible)
		await expect(helpers.tableRow(page, familyTitle).first()).toBeVisible();
		await expect(helpers.tableRow(page, smallTitle).first()).toBeVisible();
		await expect(helpers.tableRow(page, standardTitle).first()).toBeVisible();

		// Sort descending
		await page.goto(`/library?search=${helpers.prefix}_Sort&sortField=shelf_category&sortDir=desc`);
		await expect(helpers.tableRow(page, familyTitle).first()).toBeVisible();
		await expect(helpers.tableRow(page, smallTitle).first()).toBeVisible();
		await expect(helpers.tableRow(page, standardTitle).first()).toBeVisible();
	});

	test('CSV import with shelf_category column', async ({ page, helpers }) => {
		const titleA = `${helpers.prefix}_CsvShelfA`;
		const titleB = `${helpers.prefix}_CsvShelfB`;
		const csvContent = [
			'action,title,BGG_ID,copy_count,shelf_category',
			`add,${titleA},88030,1,family`,
			`add,${titleB},88031,1,small`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-shelf-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });
			await expect(dialog.locator('.dialog-message')).toContainText('2 game(s) to add');

			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('CSV import complete')).toBeVisible({ timeout: 10_000 });
			await expect(page.getByText('2 added')).toBeVisible();

			// Verify shelf categories were set correctly
			await page.goto(`/management/games?search=${helpers.prefix}_CsvShelf`);
			const rowA = helpers.tableRow(page, titleA).first();
			await expect(rowA).toBeVisible();
			await expect(rowA).toContainText('Family');

			const rowB = helpers.tableRow(page, titleB).first();
			await expect(rowB).toBeVisible();
			await expect(rowB).toContainText('Small');
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV export includes shelf_category column', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_CsvShelfExp`;
		await helpers.createGame(title, { bggId: 88040, shelfCategory: 'family' });

		await page.goto('/management/games');

		// Intercept the blob URL creation to capture CSV content
		const csvContentPromise = page.evaluate(() => {
			return new Promise<string>((resolve) => {
				const origCreateObjectURL = URL.createObjectURL;
				URL.createObjectURL = (blob: Blob) => {
					blob.text().then(resolve);
					return origCreateObjectURL(blob);
				};
			});
		});

		await page.locator('button', { hasText: 'CSV Export' }).click();

		const csvContent = await csvContentPromise;
		const lines = csvContent.trim().split(/\r?\n/);
		const headers = lines[0].split(',').map((h) => h.trim());

		expect(headers).toContain('shelf_category');

		// Find the row for our game and verify shelf_category value
		const gameRow = lines.find((l) => l.includes(title));
		expect(gameRow).toBeDefined();
		expect(gameRow).toContain('family');

		await expect(page.getByText('CSV exported successfully')).toBeVisible();
	});
});
