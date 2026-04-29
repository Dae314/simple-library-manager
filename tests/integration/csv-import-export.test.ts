import { test, expect } from './fixtures';
import path from 'node:path';
import fs from 'node:fs';

const TMP_DIR = path.join(process.cwd(), 'tests', 'integration');

test.describe('CSV Import & Export', () => {
	test('CSV export triggers download and shows success toast', async ({ page }) => {
		await page.goto('/management/games');

		await page.locator('button', { hasText: 'CSV Export' }).click();

		await expect(page.getByText('CSV exported successfully')).toBeVisible();
	});

	test('CSV import — valid file shows confirmation and imports games', async ({ page, helpers }) => {
		const titleA = `${helpers.prefix}_CsvImpA`;
		const titleB = `${helpers.prefix}_CsvImpB`;
		const csvContent = `title,BGG_ID,copy_count\n${titleA},70101,1\n${titleB},70102,2`;
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-valid-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });

			await expect(dialog.locator('.dialog-title')).toHaveText('Import CSV');
			await expect(dialog.locator('.dialog-message')).toContainText('3 game(s) will be imported');

			await expect(dialog.locator('.btn-confirm')).toHaveText('Import');
			await expect(dialog.locator('.btn-cancel')).toHaveText('Cancel');

			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('Imported 3 game(s) from CSV')).toBeVisible({ timeout: 10_000 });

			// Navigate with search to find the imported games (they may be beyond page 1)
			await page.goto(`/management/games?search=${helpers.prefix}_CsvImp`);
			await expect(page.locator('.game-card', { hasText: titleA }).first()).toBeVisible();
			await expect(page.locator('.game-card', { hasText: titleB }).first()).toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — invalid file shows validation errors', async ({ page, helpers }) => {
		const csvContent = 'title,BGG_ID,copy_count\n,36218,1\nBadGame,-5,0';
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-invalid-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const errorsDiv = page.locator('.csv-errors');
			await expect(errorsDiv).toBeVisible({ timeout: 10_000 });
			await expect(errorsDiv.locator('h3')).toHaveText('CSV Validation Errors');

			const errorItems = errorsDiv.locator('li');
			await expect(errorItems).not.toHaveCount(0);

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).not.toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — cancel confirmation does not import games', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_CsvCancel`;
		const csvContent = `title,BGG_ID,copy_count\n${title},99999,1`;
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-cancel-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });

			await dialog.locator('.btn-cancel').click();

			await expect(dialog).not.toBeVisible();

			await expect(page.locator('.game-card', { hasText: title })).not.toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});
});
