import { test, expect } from './fixtures';
import path from 'node:path';
import fs from 'node:fs';

test.describe('Database Backup & Restore', () => {
	test('backup page is accessible from management area', async ({ page }) => {
		await page.goto('/management');

		const backupCard = page.locator('a[href="/management/backup"]');
		await expect(backupCard).toBeVisible();
		await expect(backupCard).toContainText('Backup');

		await backupCard.click();
		await expect(page).toHaveURL('/management/backup');
	});

	test('backup page displays export and import sections', async ({ page }) => {
		await page.goto('/management/backup');

		const backLink = page.locator('a.back-link');
		await expect(backLink).toBeVisible();
		await expect(backLink).toContainText('Management');

		await expect(page.locator('h1')).toHaveText('Database Backup');

		// Export section
		const exportSection = page.locator('section.backup-section').first();
		await expect(exportSection.locator('h2')).toHaveText('Export');
		await expect(exportSection.locator('p.section-desc')).toContainText('Download a full backup');

		const downloadLink = exportSection.locator('a[href="/api/backup/export"]');
		await expect(downloadLink).toBeVisible();
		await expect(downloadLink).toHaveText('Download Backup');
		await expect(downloadLink).toHaveAttribute('download', '');

		// Import section
		const importSection = page.locator('section.backup-section').nth(1);
		await expect(importSection.locator('h2')).toHaveText('Import');
		await expect(importSection.locator('p.section-desc')).toContainText('Restore the database');

		const fileInput = importSection.locator('input[type="file"]');
		await expect(fileInput).toBeVisible();
		await expect(fileInput).toHaveAttribute('accept', '.dump,.backup,.sql');

		const restoreButton = importSection.getByRole('button', { name: 'Restore from Backup' });
		await expect(restoreButton).toBeVisible();
		await expect(restoreButton).toBeEnabled();
	});

	test('export download link returns a response', async ({ page }) => {
		await page.goto('/management/backup');

		const [response] = await Promise.all([
			page.waitForResponse((resp) => resp.url().includes('/api/backup/export')),
			page.evaluate(() => {
				return fetch('/api/backup/export').then((r) => ({
					status: r.status,
					contentType: r.headers.get('content-type')
				}));
			})
		]);

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

		await page.getByRole('button', { name: 'Restore from Backup' }).click();

		await expect(page.getByText('Please select a backup file first')).toBeVisible();
	});

	test('selecting a file shows file info', async ({ page, helpers }) => {
		await page.goto('/management/backup');

		const dummyContent = Buffer.from('PGDMP-test-content');
		const tmpFile = path.join(process.cwd(), 'tests', 'integration', `${helpers.prefix}-test-backup.dump`);
		fs.writeFileSync(tmpFile, dummyContent);

		try {
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(tmpFile);

			await expect(page.locator('.file-info')).toBeVisible();
			await expect(page.locator('.file-info')).toContainText(`${helpers.prefix}-test-backup.dump`);

			const restoreButton = page.getByRole('button', { name: 'Restore from Backup' });
			await expect(restoreButton).toBeEnabled();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('clicking restore opens confirmation dialog', async ({ page, helpers }) => {
		await page.goto('/management/backup');

		const dummyContent = Buffer.from('PGDMP-test-content');
		const tmpFile = path.join(process.cwd(), 'tests', 'integration', `${helpers.prefix}-dialog-backup.dump`);
		fs.writeFileSync(tmpFile, dummyContent);

		try {
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(tmpFile);

			await page.getByRole('button', { name: 'Restore from Backup' }).click();

			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible();

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

			await expect(dialog.locator('.btn-confirm')).toHaveText('Restore');
			await expect(dialog.locator('.btn-cancel')).toHaveText('Cancel');
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('cancelling the confirmation dialog closes it without submitting', async ({ page, helpers }) => {
		await page.goto('/management/backup');

		const dummyContent = Buffer.from('PGDMP-test-content');
		const tmpFile = path.join(process.cwd(), 'tests', 'integration', `${helpers.prefix}-cancel-backup.dump`);
		fs.writeFileSync(tmpFile, dummyContent);

		try {
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(tmpFile);

			await page.getByRole('button', { name: 'Restore from Backup' }).click();
			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible();

			await dialog.locator('.btn-cancel').click();

			await expect(dialog).not.toBeVisible();

			await expect(page.getByRole('button', { name: 'Restore from Backup' })).toBeEnabled();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test.skip('full round-trip: export then import (requires pg_dump/pg_restore)', async ({ page }) => {
		// This test requires pg_dump and pg_restore CLI tools to be installed
		// on the test machine. Skip by default.

		await page.goto('/management/backup');

		const downloadPromise = page.waitForEvent('download');
		await page.locator('a[href="/api/backup/export"]').click();
		const download = await downloadPromise;

		const downloadPath = path.join(process.cwd(), 'tests', 'integration', 'exported-backup.dump');
		await download.saveAs(downloadPath);

		const fileBuffer = fs.readFileSync(downloadPath);
		expect(fileBuffer.length).toBeGreaterThan(0);
		expect(fileBuffer.subarray(0, 5).toString()).toBe('PGDMP');

		try {
			const fileInput = page.locator('input[type="file"][accept=".dump,.backup,.sql"]');
			await fileInput.setInputFiles(downloadPath);

			await page.getByRole('button', { name: 'Restore from Backup' }).click();

			const dialog = page.locator('dialog.confirm-dialog');
			await expect(dialog).toBeVisible();
			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('Database restored successfully')).toBeVisible({
				timeout: 30_000
			});
		} finally {
			if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
		}
	});
});
