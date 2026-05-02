import { test, expect } from './fixtures';

const BASE = 'http://localhost:8080';
const TEST_PASSWORD = 'convention-secret-2026';
const CHANGED_PASSWORD = 'new-convention-secret';

/**
 * Helper: set a password via the config page UI.
 * Assumes the page is already on /management/config and no password is set.
 */
async function setPasswordViaUI(page: import('@playwright/test').Page, password: string) {
	await page.locator('#setPassword').fill(password);
	await page.locator('#setPasswordConfirmation').fill(password);
	await page.getByRole('button', { name: 'Set Password' }).click();
	await expect(page.getByText('Password set. Management pages are now protected.')).toBeVisible();
}

/**
 * Helper: remove the password via the config page UI.
 * Assumes the page is already on /management/config and a password is set and authenticated.
 */
async function removePasswordViaUI(page: import('@playwright/test').Page, currentPassword: string) {
	const removeDetails = page.locator('details', { hasText: 'Remove Password' });
	await removeDetails.locator('summary').click();
	await removeDetails.locator('#removeCurrentPassword').fill(currentPassword);
	await removeDetails.getByRole('button', { name: 'Remove Password' }).click();
	await expect(page.getByText('Password removed. Management pages are now open.')).toBeVisible();
}

/**
 * Helper: log in through the auth gate.
 * Assumes the auth gate is currently displayed.
 */
async function loginViaAuthGate(page: import('@playwright/test').Page, password: string) {
	await page.locator('#password').fill(password);
	await page.getByRole('button', { name: 'Unlock' }).click();
}

/**
 * Helper: ensure no password is set by navigating to config and removing it if present.
 */
async function ensureNoPassword(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext, password: string) {
	await page.goto('/management/config');

	// If auth gate is showing, log in first
	const authGate = page.locator('.auth-gate');
	if (await authGate.isVisible({ timeout: 1000 }).catch(() => false)) {
		await loginViaAuthGate(page, password);
		await page.goto('/management/config');
	}

	// If password is set, remove it
	const passwordActive = page.getByText('Password active');
	if (await passwordActive.isVisible({ timeout: 1000 }).catch(() => false)) {
		await removePasswordViaUI(page, password);
	}
}

/**
 * Password protection tests run serially within each describe block to avoid
 * parallel test-reset conflicts. Each test manages its own password state.
 */
test.describe('Password Protection', () => {
	// Run tests serially to avoid parallel DB conflicts
	test.describe.configure({ mode: 'serial' });

	// Ensure clean state at the start of the entire suite.
	// This handles leftover password from a previous failed run.
	test.beforeAll(async ({ request }) => {
		const res = await request.post(`${BASE}/api/test-reset`);
		if (!res.ok()) {
			console.warn('Initial test-reset failed, tests may have stale state');
		}
	});

	test.describe('No-password access', () => {
		test('management pages are accessible without auth prompt when no password is set', async ({ page }) => {
			await page.goto('/management');
			await expect(page.locator('h1', { hasText: 'Management' })).toBeVisible();
			await expect(page.locator('.auth-gate')).not.toBeVisible();
		});

		test('management config page is accessible without auth prompt', async ({ page }) => {
			await page.goto('/management/config');
			await expect(page.locator('h1')).toHaveText('Convention Configuration');
			await expect(page.locator('.auth-gate')).not.toBeVisible();
		});

		test('management games page is accessible without auth prompt', async ({ page }) => {
			await page.goto('/management/games');
			await expect(page.locator('h1', { hasText: 'Games' })).toBeVisible();
			await expect(page.locator('.auth-gate')).not.toBeVisible();
		});

		test('management backup page is accessible without auth prompt', async ({ page }) => {
			await page.goto('/management/backup');
			await expect(page.locator('h1')).toHaveText('Database Backup');
			await expect(page.locator('.auth-gate')).not.toBeVisible();
		});

		test('config page shows "Set Password" form when no password is set', async ({ page }) => {
			await page.goto('/management/config');
			await expect(page.getByText('Password Protection')).toBeVisible();
			await expect(page.locator('#setPassword')).toBeVisible();
			await expect(page.locator('#setPasswordConfirmation')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Set Password' })).toBeVisible();
		});
	});

	test.describe('Set password flow', () => {
		test.afterEach(async ({ page, context }) => {
			// Clean up: remove password if it was set
			await ensureNoPassword(page, context, TEST_PASSWORD);
		});

		test('set password from config page creates session', async ({ page }) => {
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// After setting password, should see "Password active" badge
			await expect(page.getByText('Password active')).toBeVisible();

			// Should still be on config page (session was created, not locked out)
			await expect(page.locator('h1')).toHaveText('Convention Configuration');
		});

		test('set password with mismatched confirmation shows error', async ({ page }) => {
			await page.goto('/management/config');
			await page.locator('#setPassword').fill(TEST_PASSWORD);
			await page.locator('#setPasswordConfirmation').fill('different-password');
			await page.getByRole('button', { name: 'Set Password' }).click();

			await expect(page.locator('.field-error')).toBeVisible();
		});

		test('set password with empty password shows error', async ({ page }) => {
			await page.goto('/management/config');

			// Don't fill the fields — just click submit
			await page.getByRole('button', { name: 'Set Password' }).click();

			await expect(page.locator('.field-error')).toBeVisible();
		});
	});

	test.describe('Auth gate and login', () => {
		// Set password once before all tests in this group
		test('auth gate appears when password is set and no session', async ({ page, context }) => {
			// Set password first
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// Clear cookies to remove session
			await context.clearCookies();

			// Visit management page — should see auth gate
			await page.goto('/management');
			await expect(page.locator('.auth-gate')).toBeVisible();
			await expect(page.getByText('Management Access')).toBeVisible();
			await expect(page.locator('#password')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible();

			// Clean up: login and remove password
			await loginViaAuthGate(page, TEST_PASSWORD);
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await page.goto('/management/config');
			await expect(page.getByText('Password active')).toBeVisible();
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('auth gate appears on all management sub-pages', async ({ page, context }) => {
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);
			await context.clearCookies();

			// Check config page
			await page.goto('/management/config');
			await expect(page.locator('.auth-gate')).toBeVisible();

			// Check games page
			await page.goto('/management/games');
			await expect(page.locator('.auth-gate')).toBeVisible();

			// Check backup page
			await page.goto('/management/backup');
			await expect(page.locator('.auth-gate')).toBeVisible();

			// Check transactions page
			await page.goto('/management/transactions');
			await expect(page.locator('.auth-gate')).toBeVisible();

			// Clean up: login from the auth gate, wait for it to disappear, then remove password
			await loginViaAuthGate(page, TEST_PASSWORD);
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await page.goto('/management/config');
			await expect(page.getByText('Password active')).toBeVisible();
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('correct password grants access', async ({ page, context }) => {
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);
			await context.clearCookies();

			await page.goto('/management');
			await expect(page.locator('.auth-gate')).toBeVisible();

			await loginViaAuthGate(page, TEST_PASSWORD);

			// Should now see management page content
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await expect(page.locator('h1', { hasText: 'Management' })).toBeVisible();

			// Clean up
			await page.goto('/management/config');
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('wrong password shows error message', async ({ page, context }) => {
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);
			await context.clearCookies();

			await page.goto('/management');
			await expect(page.locator('.auth-gate')).toBeVisible();

			await loginViaAuthGate(page, 'wrong-password');

			// Should still see auth gate with error
			await expect(page.locator('.auth-gate')).toBeVisible();
			await expect(page.getByText('Incorrect password')).toBeVisible();

			// Clean up: login with correct password and remove
			await page.locator('#password').fill(TEST_PASSWORD);
			await page.getByRole('button', { name: 'Unlock' }).click();
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await page.goto('/management/config');
			await removePasswordViaUI(page, TEST_PASSWORD);
		});
	});

	test.describe('Session persistence', () => {
		test('after login, navigate between management pages without re-prompting', async ({ page, context }) => {
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);
			await context.clearCookies();

			// Login via auth gate
			await page.goto('/management');
			await loginViaAuthGate(page, TEST_PASSWORD);
			await expect(page.locator('.auth-gate')).not.toBeVisible();

			// Navigate to config — should not see auth gate
			await page.goto('/management/config');
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await expect(page.locator('h1')).toHaveText('Convention Configuration');

			// Navigate to games — should not see auth gate
			await page.goto('/management/games');
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await expect(page.locator('h1', { hasText: 'Games' })).toBeVisible();

			// Navigate to backup — should not see auth gate
			await page.goto('/management/backup');
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await expect(page.locator('h1')).toHaveText('Database Backup');

			// Navigate to transactions — should not see auth gate
			await page.goto('/management/transactions');
			await expect(page.locator('.auth-gate')).not.toBeVisible();

			// Clean up
			await page.goto('/management/config');
			await removePasswordViaUI(page, TEST_PASSWORD);
		});
	});

	test.describe('Password change', () => {
		test('change password, verify new password works', async ({ page, context }) => {
			// Set initial password
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// Change password
			const changeDetails = page.locator('details', { hasText: 'Change Password' });
			await changeDetails.locator('summary').click();
			await changeDetails.locator('#changeCurrentPassword').fill(TEST_PASSWORD);
			await changeDetails.locator('#changeNewPassword').fill(CHANGED_PASSWORD);
			await changeDetails.locator('#changeNewPasswordConfirmation').fill(CHANGED_PASSWORD);
			await changeDetails.getByRole('button', { name: 'Change Password' }).click();
			await expect(page.getByText('Password changed successfully.')).toBeVisible();

			// Clear cookies and verify new password works
			await context.clearCookies();
			await page.goto('/management');
			await expect(page.locator('.auth-gate')).toBeVisible();

			// Old password should not work
			await loginViaAuthGate(page, TEST_PASSWORD);
			await expect(page.getByText('Incorrect password')).toBeVisible();

			// New password should work
			await page.locator('#password').fill(CHANGED_PASSWORD);
			await page.getByRole('button', { name: 'Unlock' }).click();
			await expect(page.locator('.auth-gate')).not.toBeVisible();

			// Clean up: remove password with the new password
			await page.goto('/management/config');
			await removePasswordViaUI(page, CHANGED_PASSWORD);
		});

		test('change password with wrong current password shows error', async ({ page }) => {
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			const changeDetails = page.locator('details', { hasText: 'Change Password' });
			await changeDetails.locator('summary').click();
			await changeDetails.locator('#changeCurrentPassword').fill('wrong-password');
			await changeDetails.locator('#changeNewPassword').fill(CHANGED_PASSWORD);
			await changeDetails.locator('#changeNewPasswordConfirmation').fill(CHANGED_PASSWORD);
			await changeDetails.getByRole('button', { name: 'Change Password' }).click();

			await expect(page.locator('.field-error', { hasText: 'Current password is incorrect' })).toBeVisible();

			// Clean up
			await removePasswordViaUI(page, TEST_PASSWORD);
		});
	});

	test.describe('Password removal', () => {
		test('remove password restores open access', async ({ page, context }) => {
			// Set password
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);
			await expect(page.getByText('Password active')).toBeVisible();

			// Remove password
			await removePasswordViaUI(page, TEST_PASSWORD);

			// Should see "Set Password" form again
			await expect(page.locator('#setPassword')).toBeVisible();

			// Clear cookies and verify no auth gate
			await context.clearCookies();
			await page.goto('/management');
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await expect(page.locator('h1', { hasText: 'Management' })).toBeVisible();
		});

		test('remove password with wrong current password shows error', async ({ page }) => {
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			const removeDetails = page.locator('details', { hasText: 'Remove Password' });
			await removeDetails.locator('summary').click();
			await removeDetails.locator('#removeCurrentPassword').fill('wrong-password');
			await removeDetails.getByRole('button', { name: 'Remove Password' }).click();

			await expect(page.locator('.field-error', { hasText: 'Current password is incorrect' })).toBeVisible();

			// Clean up: remove with correct password
			await removeDetails.locator('#removeCurrentPassword').fill(TEST_PASSWORD);
			await removeDetails.getByRole('button', { name: 'Remove Password' }).click();
			await expect(page.getByText('Password removed. Management pages are now open.')).toBeVisible();
		});
	});

	test.describe('Backup restore confirmation', () => {
		test('backup restore warning about password hash is displayed', async ({ page }) => {
			await page.goto('/management/backup');

			// The warning should always be visible in the import section
			await expect(page.locator('.restore-warning')).toBeVisible();
			await expect(page.getByText('replace the current password hash')).toBeVisible();
			await expect(page.getByText('reset-password.js')).toBeVisible();
		});

		test('backup restore requires password confirmation when password is set', async ({ page }) => {
			// Set password first
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// Go to backup page
			await page.goto('/management/backup');

			// Upload a dummy file to enable the restore button
			const fileInput = page.locator('input[type="file"][aria-label="Select backup file"]');
			await fileInput.setInputFiles({
				name: 'test-backup.dump',
				mimeType: 'application/octet-stream',
				buffer: Buffer.from('dummy backup content')
			});

			// Click restore button to open dialog
			await page.getByRole('button', { name: 'Restore from Backup' }).click();

			// The dialog should show a password confirmation field
			const dialog = page.locator('dialog[aria-label="Restore Database"]');
			await expect(dialog).toBeVisible();
			await expect(dialog.locator('#restore-confirm-password')).toBeVisible();
			await expect(dialog.getByText('Enter your password to confirm')).toBeVisible();

			// The Restore button should be disabled when password field is empty
			await expect(dialog.locator('.btn-confirm')).toBeDisabled();

			// Clean up: close dialog and remove password
			await dialog.locator('.btn-cancel').click();
			await page.goto('/management/config');
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('backup restore dialog has no password field when no password is set', async ({ page }) => {
			await page.goto('/management/backup');

			const fileInput = page.locator('input[type="file"][aria-label="Select backup file"]');
			await fileInput.setInputFiles({
				name: 'test-backup.dump',
				mimeType: 'application/octet-stream',
				buffer: Buffer.from('dummy')
			});

			await page.getByRole('button', { name: 'Restore from Backup' }).click();

			const dialog = page.locator('dialog[aria-label="Restore Database"]');
			await expect(dialog).toBeVisible();

			// Should NOT have a password field
			await expect(dialog.locator('#restore-confirm-password')).not.toBeVisible();
		});
	});

	test.describe('CSV import confirmation', () => {
		test('CSV import requires password confirmation when password is set', async ({ page, helpers }) => {
			// Create a game so CSV export has data
			await helpers.createGame(`${helpers.prefix}_CsvTest`);

			// Set password
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// Go to games page
			await page.goto('/management/games');

			// Prepare a valid CSV file for import
			const csvContent = 'title,bgg_id,game_type\nTestCsvGame,12345,standard\n';
			const csvFileInput = page.locator('input[type="file"][accept=".csv"]').first();
			await csvFileInput.setInputFiles({
				name: 'test-import.csv',
				mimeType: 'text/csv',
				buffer: Buffer.from(csvContent)
			});

			// Wait for validation to complete and dialog to appear
			const dialog = page.locator('dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });

			// Should show password confirmation field
			await expect(dialog.locator('#csv-import-confirm-password')).toBeVisible();
			await expect(dialog.getByText('Enter your password to confirm')).toBeVisible();

			// Import button should be disabled when password is empty
			await expect(dialog.locator('.btn-confirm')).toBeDisabled();

			// Clean up: close dialog and remove password
			await dialog.locator('.btn-cancel').click();
			await page.goto('/management/config');
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('CSV import dialog has no password field when no password is set', async ({ page, helpers }) => {
			await helpers.createGame(`${helpers.prefix}_CsvTest2`);

			await page.goto('/management/games');

			const csvContent = 'title,bgg_id,game_type\nTestCsvGame2,12346,standard\n';
			const csvFileInput = page.locator('input[type="file"][accept=".csv"]').first();
			await csvFileInput.setInputFiles({
				name: 'test-import.csv',
				mimeType: 'text/csv',
				buffer: Buffer.from(csvContent)
			});

			const dialog = page.locator('dialog[aria-label="Import CSV"]');
			await expect(dialog).toBeVisible({ timeout: 10_000 });

			// Should NOT have a password field
			await expect(dialog.locator('#csv-import-confirm-password')).not.toBeVisible();
		});
	});

	test.describe('Game deletion confirmation', () => {
		test('game deletion dialog requires password confirmation when password is set', async ({ page, helpers }) => {
			// Create a game to test with
			const game = await helpers.createGame(`${helpers.prefix}_DeletePwdTest`);

			// Set password
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// Navigate to the game detail page
			await page.goto(`/management/games/${game.id}`);

			// Click the delete button
			await page.getByRole('button', { name: 'Delete Game' }).click();

			// The dialog should show a password confirmation field
			const dialog = page.locator('dialog[aria-label="Delete Game"]');
			await expect(dialog).toBeVisible();
			await expect(dialog.locator('#delete-confirm-password')).toBeVisible();
			await expect(dialog.getByText('Enter your password to confirm')).toBeVisible();

			// The Delete (confirm) button should be disabled when password field is empty
			await expect(dialog.locator('.btn-dialog-confirm')).toBeDisabled();

			// Clean up: close dialog and remove password
			await dialog.locator('.btn-dialog-cancel').click();
			await page.goto('/management/config');
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('game deletion dialog has no password field when no password is set', async ({ page, helpers }) => {
			const game = await helpers.createGame(`${helpers.prefix}_DeleteNoPwdTest`);

			await page.goto(`/management/games/${game.id}`);

			await page.getByRole('button', { name: 'Delete Game' }).click();

			const dialog = page.locator('dialog[aria-label="Delete Game"]');
			await expect(dialog).toBeVisible();

			// Should NOT have a password field
			await expect(dialog.locator('#delete-confirm-password')).not.toBeVisible();
		});
	});

	test.describe('Backup export protection', () => {
		test('unauthenticated export returns 401 when password is set', async ({ page, context, request }) => {
			// Set password via UI
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// Clear cookies to remove session
			await context.clearCookies();

			// Try to access the export endpoint without a session cookie
			const res = await request.get(`${BASE}/api/backup/export`);
			expect(res.status()).toBe(401);

			const body = await res.json();
			expect(body.error).toBe('Unauthorized');

			// Clean up: login via auth gate and remove password
			await page.goto('/management');
			await expect(page.locator('.auth-gate')).toBeVisible();
			await loginViaAuthGate(page, TEST_PASSWORD);
			await expect(page.locator('.auth-gate')).not.toBeVisible();
			await page.goto('/management/config');
			await expect(page.getByText('Password active')).toBeVisible();
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('authenticated export succeeds when password is set', async ({ page, request }) => {
			// Set password via UI (this creates a session cookie)
			await page.goto('/management/config');
			await setPasswordViaUI(page, TEST_PASSWORD);

			// Get the session cookie from the browser context
			const cookies = await page.context().cookies();
			const sessionCookie = cookies.find((c) => c.name === 'mgmt_session');
			expect(sessionCookie).toBeDefined();

			// Make the export request with the session cookie
			const res = await request.get(`${BASE}/api/backup/export`, {
				headers: {
					Cookie: `mgmt_session=${sessionCookie!.value}`
				}
			});
			expect(res.status()).toBe(200);

			// Clean up
			await page.goto('/management/config');
			await removePasswordViaUI(page, TEST_PASSWORD);
		});

		test('export works without auth when no password is set', async ({ request }) => {
			const res = await request.get(`${BASE}/api/backup/export`);
			expect(res.status()).toBe(200);
		});
	});
});
