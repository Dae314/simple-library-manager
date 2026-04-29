import { test, expect } from './fixtures';

test.describe('Play & Win and Play & Take Flows', () => {
	test('play_and_win checkin shows raffle reminder', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_PwRaffle`, { gameType: 'play_and_win' });

		await helpers.checkoutGame(game.title, 'Raffle', 'Tester', '15.0');

		await page.goto('/checkin');
		const checkinCard = page.locator('.game-card', { hasText: game.title }).first();
		await expect(checkinCard).toBeVisible();
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		const raffleReminder = checkinForm.locator('.raffle-reminder');
		await expect(raffleReminder).toBeVisible();
		await expect(raffleReminder).toContainText('Play & Win');
		await expect(raffleReminder).toContainText('raffle entries');
		await expect(raffleReminder).toContainText('Raffle Tester');

		await checkinForm.locator('#checkinWeight').fill('15.0');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();
	});

	test('play_and_take — attendee takes the game (retires it)', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_PtTake`, { gameType: 'play_and_take' });

		await helpers.checkoutGame(game.title, 'Take', 'Tester', '25.0');

		await page.goto('/checkin');
		const checkinCard = page.locator('.game-card', { hasText: game.title }).first();
		await expect(checkinCard).toBeVisible();
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		await checkinForm.locator('#checkinWeight').fill('25.0');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		const dialog = page.locator('dialog.confirm-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.dialog-title')).toHaveText('Play & Take');
		await expect(dialog.locator('.dialog-message')).toContainText('take this game home');

		await dialog.locator('.btn-confirm').click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Game should no longer appear on checkout page (retired)
		await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
		await expect(page.locator('.game-card', { hasText: game.title })).toHaveCount(0);
	});

	test('play_and_take — attendee returns the game (normal checkin)', async ({ page, helpers }) => {
		const game = await helpers.createGame(`${helpers.prefix}_PtReturn`, { gameType: 'play_and_take' });

		await helpers.checkoutGame(game.title, 'Return', 'Tester', '20.0');

		await page.goto('/checkin');
		const checkinCard = page.locator('.game-card', { hasText: game.title }).first();
		await expect(checkinCard).toBeVisible();
		await checkinCard.getByRole('button', { name: 'Check In' }).click();

		const checkinForm = page.locator('section[aria-label="Check in form"]');
		await expect(checkinForm).toBeVisible();

		await checkinForm.locator('#checkinWeight').fill('20.0');
		await checkinForm.getByRole('button', { name: 'Confirm Check In' }).click();

		const dialog = page.locator('dialog.confirm-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.dialog-title')).toHaveText('Play & Take');

		// Click "No, return it"
		await dialog.locator('.btn-cancel').click();

		await expect(page.getByText('Game checked in successfully!')).toBeVisible();

		// Game should still be available on checkout page
		await page.goto(`/checkout?search=${encodeURIComponent(game.title)}`);
		await expect(page.locator('.game-card', { hasText: game.title })).toBeVisible();
	});
});
