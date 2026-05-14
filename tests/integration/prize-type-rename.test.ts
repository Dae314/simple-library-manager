import { test, expect } from './fixtures';
import path from 'node:path';
import fs from 'node:fs';

const TMP_DIR = path.join(process.cwd(), 'tests', 'integration');

test.describe('Prize Type Rename (gameType → prizeType)', () => {
	test('create game with play_and_win prize type via API and verify on library page', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_PrizeCreate`;
		await helpers.createGame(title, { bggId: 90001, gameType: 'play_and_win' });

		await page.goto(`/library?search=${encodeURIComponent(title)}`);
		const row = helpers.tableRow(page, title).first();
		await expect(row).toBeVisible();

		// Verify the badge displays "Play & Win"
		await expect(row.locator('.badge')).toContainText('Play & Win');
	});

	test('prize type badge displays correctly for all types', async ({ page, helpers }) => {
		const titleStd = `${helpers.prefix}_PrizeBadgeStd`;
		const titlePW = `${helpers.prefix}_PrizeBadgePW`;
		const titlePT = `${helpers.prefix}_PrizeBadgePT`;

		await helpers.createGame(titleStd, { bggId: 90010, gameType: 'standard' });
		await helpers.createGame(titlePW, { bggId: 90011, gameType: 'play_and_win' });
		await helpers.createGame(titlePT, { bggId: 90012, gameType: 'play_and_take' });

		await page.goto(`/library?search=${helpers.prefix}_PrizeBadge`);

		const rowStd = helpers.tableRow(page, titleStd).first();
		const rowPW = helpers.tableRow(page, titlePW).first();
		const rowPT = helpers.tableRow(page, titlePT).first();

		await expect(rowStd).toBeVisible();
		await expect(rowPW).toBeVisible();
		await expect(rowPT).toBeVisible();

		await expect(rowStd.locator('.badge')).toContainText('Standard');
		await expect(rowPW.locator('.badge')).toContainText('Play & Win');
		await expect(rowPT.locator('.badge')).toContainText('Play & Take');
	});

	test('filter by prize type on library page', async ({ page, helpers }) => {
		const titleStd = `${helpers.prefix}_PrizeFilterStd`;
		const titlePW = `${helpers.prefix}_PrizeFilterPW`;

		await helpers.createGame(titleStd, { bggId: 90020, gameType: 'standard' });
		await helpers.createGame(titlePW, { bggId: 90021, gameType: 'play_and_win' });

		// Filter by play_and_win
		await page.goto(`/library?search=${helpers.prefix}_PrizeFilter&prizeType=play_and_win`);

		// Only the play_and_win game should be visible
		await expect(helpers.tableRow(page, titlePW).first()).toBeVisible();
		await expect(helpers.tableRow(page, titleStd)).toHaveCount(0);

		// Filter by standard
		await page.goto(`/library?search=${helpers.prefix}_PrizeFilter&prizeType=standard`);

		await expect(helpers.tableRow(page, titleStd).first()).toBeVisible();
		await expect(helpers.tableRow(page, titlePW)).toHaveCount(0);
	});

	test('CSV import with legacy game_type header creates games with correct prize type', async ({ page, helpers }) => {
		const titleA = `${helpers.prefix}_LegacyCsvA`;
		const titleB = `${helpers.prefix}_LegacyCsvB`;
		const csvContent = [
			'action,title,BGG_ID,copy_count,game_type',
			`add,${titleA},90030,1,play_and_win`,
			`add,${titleB},90031,1,play_and_take`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-legacy-gametype.csv`);
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

			// Verify games were created with correct prize types
			await page.goto(`/management/games?search=${helpers.prefix}_LegacyCsv`);
			const rowA = page.locator('tbody tr', { hasText: titleA }).first();
			const rowB = page.locator('tbody tr', { hasText: titleB }).first();

			await expect(rowA).toBeVisible();
			await expect(rowB).toBeVisible();

			await expect(rowA.locator('.badge')).toContainText('Play & Win');
			await expect(rowB.locator('.badge')).toContainText('Play & Take');
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV export uses prize_type as column header', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_PrizeExport`;
		await helpers.createGame(title, { bggId: 90040, gameType: 'play_and_win' });

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

		// Should use prize_type, NOT game_type
		expect(headers).toContain('prize_type');
		expect(headers).not.toContain('game_type');

		// Find the row for our game and verify prize type value
		const gameRow = lines.find((l) => l.includes(title));
		expect(gameRow).toBeDefined();
		expect(gameRow).toContain('play_and_win');

		await expect(page.getByText('CSV exported successfully')).toBeVisible();
	});
});
