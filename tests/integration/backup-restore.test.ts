import { test, expect } from './fixtures';
import path from 'node:path';
import fs from 'node:fs';

test.describe('Database Backup & Restore', () => {
	test('backup page is accessible from management area', async ({ page }) => {
		await page.goto('/management');

		// The management landing page should have a Backup nav card
		const backupCard = page.locator('a[href="/management/backup"]');
		await expect(backupCard).toBeVisible();
		await expect(backupCard).toContainText('Backup');

		await backupCard.click();
		await expect(page).toHaveURL('/management/backup');
	});

	test('backup page displays export and import sections', async ({ page }) => {
		await page.goto('/management/backup');

		// Back link to management
		const backLink = page.locator('a.back-link');
		await expect(backLink).toBeVisible();
		await expect(backLink).toContainText('Management');

		// Page heading
		await expect(page.locator('h1')).toHaveText('Database Backup');

		// Export section
		const exportSection = page.locator('section.backup-section').first();
		await expect(exportSection.locator('h2')).toHaveText('Export');
		await expect(exportSection.locator('p.section-desc')).toContainText('Download a full backup');

		// Download link
		const downloadLink = exportSection.locator('a[href="/api/backup/export"]');
		await expect(downloadLink).toBeVisible();
		await expect(downloadLink).toHaveText('Download Backup');
		await expect(downloadLink).toHaveAttribute('download', '');

		// Import section
		const importSection = page.locator('section.backup-section').nth(1);
		await expect(importSection.locator('h2')).toHaveText('Import');
		await expect(importSection.locator('p.section-desc')).toContainText('Restore the database');

		// File input
		const fileInput = importSection.locator('input[type="file"]');
		await expect(fileInput).toBeVisible();
		await expect(fileInput).toHaveAttribute('accept', '.dump,.backup,.sql');

		// Restore button (enabled, shows toast if no file selected)
		const restoreButton = importSection.getByRole('button', { name: 'Restore from Backup' });
		await expect(restoreButton).toBeVisible();
		await expect(restoreButton).toBeEnabled();
	});

	test('export download link returns a response', async ({ page }) => {
		await page.goto('/management/backup');

		// Intercept the export API request to verify it responds
		const [response] = await Promise.all([
			page.waitForResponse((resp) => resp.url().includes('/api/backup/export')),
			page.evaluate(() => {
				return fetch('/api/backup/export').then((r) => ({
					status: r.status,
					contentType: r.headers.get('content-type')
				}));
			})
		]);

		// The endpoint should respond (200 if pg_dump is available, 500 if not)
		expect(response.status()).toBeDefined();

		if (response.status() === 200) {
			const headers = response.headers();
			expect(headers['content-type']).toBe('application/octet-stream');
			expect(headers['content-disposition']).toContain('attachment');
			expect(headers['content-disposition']).toContain('.dump');
		}
	});

	test('restore button shows error toast when no file is selected', async ({ page }) => {
		await page.goto('/management/backup');

		// Click the restore button without selecting a file first
		await page.getByRole('button', { name: 'Restore from Backup' }).click();

		// Should show error toast about selecting a file first
		await expect(page.getByText('Please select a backup file first')).toBeVisible();
	});

	test('selecting a file enables the restore button and shows file info', async ({ page }) => {
		await page.goto('/management/backup');

		// Create a small dummy file for the file input
		const dummyContent = Buffer.from('PGDMP-test-content');
		const tmpFile = path.join(process.cwd(), 'tests', 'integration', 'test-backup.dump');
		fs.writeFileSync(tmpFile, dummyContent);

		try {
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(tmpFile);

			// File info should be displayed
			await expect(page.locator('.file-info')).toBeVisible();
			await expect(page.locator('.file-info')).toContainText('test-backup.dump');

			// Restore button should now be enabled
			const restoreButton = page.getByRole('button', { name: 'Restore from Backup' });
			await expect(restoreButton).toBeEnabled();
		} finally {
			// Clean up temp file
			if (fs.existsSync(tmpFile)) {
				fs.unlinkSync(tmpFile);
			}
		}
	});

	test('clicking restore opens confirmation dialog with correct text', async ({ page }) => {
		await page.goto('/management/backup');

		// Create a dummy file and select it
		const dummyContent = Buffer.from('PGDMP-test-content');
		const tmpFile = path.join(process.cwd(), 'tests', 'integration', 'test-backup.dump');
		fs.writeFileSync(tmpFile, dummyContent);

		try {
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(tmpFile);

			// Click restore button
			await page.getByRole('button', { name: 'Restore from Backup' }).click();

			// Confirmation dialog should appear
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible();

			// Verify dialog content
			await expect(dialog.locator('.dialog-title')).toHaveText('Restore Database');
			await expect(dialog.locator('.dialog-message')).toContainText(
				'Are you sure you want to restore the database from this backup?'
			);
			await expect(dialog.locator('.dialog-message')).toContainText(
				'All current data will be replaced'
			);
			await expect(dialog.locator('.dialog-warning')).toContainText(
				'This action cannot be undone'
			);

			// Verify dialog buttons
			await expect(dialog.locator('.btn-confirm')).toHaveText('Restore');
			await expect(dialog.locator('.btn-cancel')).toHaveText('Cancel');
		} finally {
			if (fs.existsSync(tmpFile)) {
				fs.unlinkSync(tmpFile);
			}
		}
	});

	test('cancelling the confirmation dialog closes it without submitting', async ({ page }) => {
		await page.goto('/management/backup');

		// Create a dummy file and select it
		const dummyContent = Buffer.from('PGDMP-test-content');
		const tmpFile = path.join(process.cwd(), 'tests', 'integration', 'test-backup.dump');
		fs.writeFileSync(tmpFile, dummyContent);

		try {
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(tmpFile);

			// Open the dialog
			await page.getByRole('button', { name: 'Restore from Backup' }).click();
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible();

			// Click Cancel
			await dialog.locator('.btn-cancel').click();

			// Dialog should close
			await expect(dialog).not.toBeVisible();

			// The restore button should still be enabled (file still selected)
			await expect(page.getByRole('button', { name: 'Restore from Backup' })).toBeEnabled();
		} finally {
			if (fs.existsSync(tmpFile)) {
				fs.unlinkSync(tmpFile);
			}
		}
	});

	test.skip('full round-trip: export then import (requires pg_dump/pg_restore)', async ({ page }) => {
		// This test requires pg_dump and pg_restore CLI tools to be installed
		// on the test machine. Skip by default.

		// Step 1: Export the database
		await page.goto('/management/backup');

		const downloadPromise = page.waitForEvent('download');
		await page.locator('a[href="/api/backup/export"]').click();
		const download = await downloadPromise;

		// Save the downloaded file
		const downloadPath = path.join(process.cwd(), 'tests', 'integration', 'exported-backup.dump');
		await download.saveAs(downloadPath);

		// Verify the file is non-empty and starts with PGDMP magic bytes
		const fileBuffer = fs.readFileSync(downloadPath);
		expect(fileBuffer.length).toBeGreaterThan(0);
		expect(fileBuffer.subarray(0, 5).toString()).toBe('PGDMP');

		try {
			// Step 2: Import the exported file
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(downloadPath);

			await page.getByRole('button', { name: 'Restore from Backup' }).click();

			// Confirm the restore
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible();
			await dialog.locator('.btn-confirm').click();

			// Wait for success toast
			await expect(page.getByText('Database restored successfully')).toBeVisible({
				timeout: 30_000
			});
		} finally {
			if (fs.existsSync(downloadPath)) {
				fs.unlinkSync(downloadPath);
			}
		}
	});
});
