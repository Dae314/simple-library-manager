import { test, expect } from './fixtures';

test.describe('Play & Win and Play & Take Flows', () => {
	test('play_and_win checkin shows raffle reminder', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_PwRaffle`, { gameType: 'play_and_win' });

		await helpers.checkoutGame(game.title, 'Raffle', 'Tester', '15.0');

		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await expect(checkinRow).toBeVisible();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		const raffleReminder = checkinDialog.locator('.raffle-reminder');
		await expect(raffleReminder).toBeVisible();
		await expect(raffleReminder).toContainText('Play & Win');
		await expect(raffleReminder).toContainText('raffle entries');
		await expect(raffleReminder).toContainText('Raffle Tester');

		await checkinDialog.locator('#checkin-checkinWeight').fill('15.0');
		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('play_and_take — attendee takes the game (retires it)', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_PtTake`, { gameType: 'play_and_take' });

		await helpers.checkoutGame(game.title, 'Take', 'Tester', '25.0');

		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await expect(checkinRow).toBeVisible();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		await checkinDialog.locator('#checkin-checkinWeight').fill('25.0');
		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();

		const dialog = page.locator('dialog.confirm-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.dialog-title')).toHaveText('Play & Take');
		await expect(dialog.locator('.dialog-message')).toContainText('take this game home');

		await dialog.locator('.btn-confirm').click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Game should no longer appear on library page (retired)
		await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
		await expect(helpers.tableRow(page, game.title)).toHaveCount(0);
	});

	test('play_and_take — attendee returns the game (normal checkin)', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_PtReturn`, { gameType: 'play_and_take' });

		await helpers.checkoutGame(game.title, 'Return', 'Tester', '20.0');

		await page.goto(`/library?search=${encodeURIComponent(game.title)}&status=checked_out`);
		const checkinRow = helpers.tableRow(page, game.title).first();
		await expect(checkinRow).toBeVisible();
		await checkinRow.getByRole('button', { name: 'Check In' }).click();

		const checkinDialog = page.locator('dialog.checkin-dialog');
		await expect(checkinDialog).toBeVisible();

		await checkinDialog.locator('#checkin-checkinWeight').fill('20.0');
		await checkinDialog.getByRole('button', { name: 'Confirm Check In' }).click();

		const dialog = page.locator('dialog.confirm-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.dialog-title')).toHaveText('Play & Take');

		// Click "No, return it"
		await dialog.locator('.btn-cancel').click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Game should still be available on library page
		await page.goto(`/library?search=${encodeURIComponent(game.title)}`);
		await expect(helpers.tableRow(page, game.title)).toBeVisible();
	});
});
