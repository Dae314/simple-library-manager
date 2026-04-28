import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const TMP_DIR = path.join(process.cwd(), 'tests', 'integration');

test.describe('CSV Import & Export', () => {
	test('CSV export triggers download and shows success toast', async ({ page }) => {
		await page.goto('/management/games');

		// Click the CSV Export button (submits a form POST to ?/csvExport)
		await page.locator('button', { hasText: 'CSV Export' }).click();

		// The $effect in the page converts csvExportData into a Blob download
		// and fires a success toast
		await expect(page.getByText('CSV exported successfully')).toBeVisible();
	});

	test('CSV import — valid file shows confirmation and imports games', async ({ page }) => {
		const csvContent = 'title,BGG_ID,copy_count\nDominion,36218,1\nRoot,246784,2';
		const tmpFile = path.join(TMP_DIR, 'valid-import.csv');
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			// Set the file on the hidden file input (the CSV Import button triggers csvFileInput.click())
			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			// Wait for the validation form to submit and the confirmation dialog to appear
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible({ timeout: 10_000 });

			// Verify dialog content
			await expect(dialog.locator('.dialog-title')).toHaveText('Import CSV');
			await expect(dialog.locator('.dialog-message')).toContainText('3 game(s) will be imported');

			// Verify dialog buttons
			await expect(dialog.locator('.btn-confirm')).toHaveText('Import');
			await expect(dialog.locator('.btn-cancel')).toHaveText('Cancel');

			// Click Import to confirm
			await dialog.locator('.btn-confirm').click();

			// Wait for success toast
			await expect(page.getByText('Imported 3 game(s) from CSV')).toBeVisible({ timeout: 10_000 });

			// Verify the imported games appear in the game list
			await expect(page.locator('.game-card', { hasText: 'Dominion' })).toBeVisible();
			await expect(page.locator('.game-card', { hasText: 'Root' })).toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — invalid file shows validation errors', async ({ page }) => {
		const csvContent = 'title,BGG_ID,copy_count\n,36218,1\nBadGame,-5,0';
		const tmpFile = path.join(TMP_DIR, 'invalid-import.csv');
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			// The csv-errors div should appear with validation errors
			const errorsDiv = page.locator('.csv-errors');
			await expect(errorsDiv).toBeVisible({ timeout: 10_000 });
			await expect(errorsDiv.locator('h3')).toHaveText('CSV Validation Errors');

			// Should list individual row errors
			const errorItems = errorsDiv.locator('li');
			await expect(errorItems).not.toHaveCount(0);

			// Confirmation dialog should NOT appear
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).not.toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — cancel confirmation does not import games', async ({ page }) => {
		const csvContent = 'title,BGG_ID,copy_count\nCancelTestGame,99999,1';
		const tmpFile = path.join(TMP_DIR, 'cancel-import.csv');
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			// Wait for confirmation dialog
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible({ timeout: 10_000 });
			await expect(dialog.locator('.dialog-title')).toHaveText('Import CSV');

			// Click Cancel
			await dialog.locator('.btn-cancel').click();

			// Dialog should close
			await expect(dialog).not.toBeVisible();

			// The game should NOT have been imported
			await expect(page.locator('.game-card', { hasText: 'CancelTestGame' })).not.toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});
});
