import { test, expect } from './fixtures';
import path from 'node:path';
import fs from 'node:fs';

const TMP_DIR = path.join(process.cwd(), 'tests', 'integration');

test.describe('CSV Import & Export', () => {
	test('CSV export includes game_type column', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_ExpType`;
		await helpers.createGame(title, { bggId: 80001, gameType: 'play_and_win' });

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

		expect(headers).toContain('prize_type');
		expect(headers).toContain('title');
		expect(headers).toContain('BGG_ID');
		expect(headers).toContain('copy_number');
		expect(headers).toContain('status');

		// Find the row for our game and verify prize_type
		const gameRow = lines.find((l) => l.includes(title));
		expect(gameRow).toBeDefined();
		expect(gameRow).toContain('play_and_win');

		await expect(page.getByText('CSV exported successfully')).toBeVisible();
	});

	test('CSV import — add action with game_type', async ({ page, helpers }) => {
		const titleA = `${helpers.prefix}_CsvTypeA`;
		const titleB = `${helpers.prefix}_CsvTypeB`;
		const csvContent = [
			'action,title,BGG_ID,copy_count,game_type',
			`add,${titleA},70201,1,play_and_win`,
			`add,${titleB},70202,1,play_and_take`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-type-import.csv`);
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

			// Verify game types were set correctly
			await page.goto(`/management/games?search=${helpers.prefix}_CsvType`);
			await expect(page.locator('tbody tr', { hasText: titleA }).first()).toBeVisible();
			await expect(page.locator('tbody tr', { hasText: titleB }).first()).toBeVisible();

			// Check game type badges
			const rowA = page.locator('tbody tr', { hasText: titleA }).first();
			await expect(rowA.locator('.badge')).toContainText(/Play.*Win/i);

			const rowB = page.locator('tbody tr', { hasText: titleB }).first();
			await expect(rowB.locator('.badge')).toContainText(/Play.*Take/i);
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — backward compatible add without action column', async ({ page, helpers }) => {
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
			await expect(dialog.locator('.dialog-message')).toContainText('3 game(s) to add');

			await expect(dialog.locator('.btn-confirm')).toHaveText('Import');
			await expect(dialog.locator('.btn-cancel')).toHaveText('Cancel');

			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('CSV import complete')).toBeVisible({ timeout: 10_000 });
			await expect(page.getByText('3 added')).toBeVisible();

			await page.goto(`/management/games?search=${helpers.prefix}_CsvImp`);
			await expect(page.locator('tbody tr', { hasText: titleA }).first()).toBeVisible();
			await expect(page.locator('tbody tr', { hasText: titleB }).first()).toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — modify action changes game_type', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_CsvMod`;
		const game = await helpers.createGame(title, { bggId: 70301, gameType: 'standard' });

		const csvContent = [
			'action,title,bgg_id,copy_number,game_type',
			`modify,${title},70301,${game.copyNumber},play_and_win`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-modify-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });
			await expect(dialog.locator('.dialog-message')).toContainText('1 game(s) to modify');

			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('CSV import complete')).toBeVisible({ timeout: 10_000 });
			await expect(page.getByText('1 modified')).toBeVisible();

			// Verify the game type was changed
			await page.goto(`/management/games?search=${helpers.prefix}_CsvMod`);
			const row = page.locator('tbody tr', { hasText: title }).first();
			await expect(row).toBeVisible();
			await expect(row.locator('.badge')).toContainText(/Play.*Win/i);
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — delete action retires a game', async ({ page, helpers }) => {
		const title = `${helpers.prefix}_CsvDel`;
		const game = await helpers.createGame(title, { bggId: 70401 });

		const csvContent = [
			'action,title,bgg_id,copy_number',
			`delete,${title},70401,${game.copyNumber}`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-delete-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });
			await expect(dialog.locator('.dialog-message')).toContainText('1 game(s) to retire');
			// Should show a warning about deletions
			await expect(dialog.locator('.dialog-warning')).toBeVisible();
			await expect(dialog.locator('.dialog-warning')).toContainText('will be retired');

			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('CSV import complete: 1 retired')).toBeVisible({ timeout: 10_000 });

			// Verify the game is now retired
			await page.goto(`/management/games?search=${helpers.prefix}_CsvDel&status=retired`);
			await expect(page.locator('tbody tr', { hasText: title }).first()).toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — mixed actions in one file', async ({ page, helpers }) => {
		// Pre-create games for modify and delete
		const modTitle = `${helpers.prefix}_CsvMix_Mod`;
		const delTitle = `${helpers.prefix}_CsvMix_Del`;
		const modGame = await helpers.createGame(modTitle, { bggId: 70501, gameType: 'standard' });
		const delGame = await helpers.createGame(delTitle, { bggId: 70502 });

		const addTitle = `${helpers.prefix}_CsvMix_Add`;
		const csvContent = [
			'action,title,bgg_id,copy_count,copy_number,game_type',
			`add,${addTitle},70503,1,,play_and_take`,
			`modify,${modTitle},70501,,${modGame.copyNumber},play_and_win`,
			`delete,${delTitle},70502,,${delGame.copyNumber},`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-mixed-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });
			await expect(dialog.locator('.dialog-message')).toContainText('1 game(s) to add');
			await expect(dialog.locator('.dialog-message')).toContainText('1 game(s) to modify');
			await expect(dialog.locator('.dialog-message')).toContainText('1 game(s) to retire');

			await dialog.locator('.btn-confirm').click();

			await expect(page.getByText('CSV import complete: 1 added, 1 modified, 1 retired')).toBeVisible({ timeout: 10_000 });

			// Verify the add
			await page.goto(`/management/games?search=${helpers.prefix}_CsvMix_Add`);
			const addRow = page.locator('tbody tr', { hasText: addTitle }).first();
			await expect(addRow).toBeVisible();
			await expect(addRow.locator('.badge')).toContainText(/Play.*Take/i);

			// Verify the modify
			await page.goto(`/management/games?search=${helpers.prefix}_CsvMix_Mod`);
			const modRow = page.locator('tbody tr', { hasText: modTitle }).first();
			await expect(modRow).toBeVisible();
			await expect(modRow.locator('.badge')).toContainText(/Play.*Win/i);

			// Verify the delete (retired)
			await page.goto(`/management/games?search=${helpers.prefix}_CsvMix_Del&status=retired`);
			await expect(page.locator('tbody tr', { hasText: delTitle }).first()).toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});

	test('CSV import — modify/delete for nonexistent game shows validation error', async ({ page, helpers }) => {
		const csvContent = [
			'action,title,bgg_id,copy_number,game_type',
			`modify,NonexistentGame_${helpers.prefix},99999,999,play_and_win`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-notfound-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const errorsDiv = page.locator('.csv-errors');
			await expect(errorsDiv).toBeVisible({ timeout: 10_000 });
			await expect(errorsDiv.locator('li').first()).toContainText('No game found');

			const dialog = page.locator('dialog.confirm-dialog[aria-label="Import CSV"]');
			await expect(dialog).not.toBeVisible();
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

	test('CSV import — invalid action value shows validation error', async ({ page, helpers }) => {
		const csvContent = [
			'action,title,bgg_id,copy_count',
			`bogus,SomeGame,12345,1`
		].join('\n');
		const tmpFile = path.join(TMP_DIR, `${helpers.prefix}-badaction-import.csv`);
		fs.writeFileSync(tmpFile, csvContent, 'utf-8');

		try {
			await page.goto('/management/games');

			const fileInput = page.locator('input[type="file"][accept=".csv"].hidden-input');
			await fileInput.setInputFiles(tmpFile);

			const errorsDiv = page.locator('.csv-errors');
			await expect(errorsDiv).toBeVisible({ timeout: 10_000 });
			await expect(errorsDiv.locator('li').first()).toContainText('Invalid action');

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

			await expect(page.locator('tbody tr', { hasText: title })).not.toBeVisible();
		} finally {
			if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		}
	});
});
