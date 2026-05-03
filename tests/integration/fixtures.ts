import { test as base, expect, type Page, type APIRequestContext, type Locator } from '@playwright/test';

const BASE = 'http://localhost:8080';

// ── Types ──────────────────────────────────────────────────────────────

interface TestGame {
	id: number;
	version: number;
	copyNumber: number;
	title: string;
}

type GameType = 'standard' | 'play_and_win' | 'play_and_take';

// ── Low-level API helpers (use request context, not page) ──────────────

async function apiCreateGame(
	request: APIRequestContext,
	title: string,
	opts?: { bggId?: number; gameType?: GameType }
): Promise<TestGame> {
	const res = await request.post(`${BASE}/api/test-helpers`, {
		data: {
			action: 'createGame',
			title,
			bggId: opts?.bggId ?? 99999,
			gameType: opts?.gameType ?? 'standard'
		}
	});
	if (!res.ok()) throw new Error(`createGame failed: ${await res.text()}`);
	const body = await res.json();
	return { ...body, title };
}

async function apiDeleteGames(request: APIRequestContext, ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	const res = await request.post(`${BASE}/api/test-helpers`, {
		data: { action: 'deleteGames', ids }
	});
	if (!res.ok()) {
		console.warn('deleteGames failed:', await res.text());
	}
}

// ── Locator helpers ────────────────────────────────────────────────────

/**
 * Locate a table row containing the given text.
 * Works for the SortableTable-based pages (checkout, checkin, catalog,
 * management games, management transactions).
 */
function tableRow(page: Page | Locator, text: string): Locator {
	return ('locator' in page ? page : page).locator('tbody tr', { hasText: text });
}

// ── UI helpers ─────────────────────────────────────────────────────────

async function uiCheckoutGame(
	page: Page,
	gameName: string,
	firstName: string,
	lastName: string,
	weight: string
): Promise<void> {
	await page.goto(`/library?search=${encodeURIComponent(gameName)}`);
	const row = tableRow(page, gameName).first();
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Checkout' }).click();

	const dialog = page.locator('dialog.checkout-dialog');
	await expect(dialog).toBeVisible();
	await dialog.locator('#checkout-attendeeFirstName').fill(firstName);
	await dialog.locator('#checkout-attendeeLastName').fill(lastName);
	await dialog.locator('#checkout-idType').selectOption({ index: 1 });
	await dialog.locator('#checkout-checkoutWeight').fill(weight);
	await dialog.getByRole('button', { name: 'Confirm Checkout' }).click();
	await expect(page.getByText('Game checked out successfully!')).toBeVisible();
}

async function uiCheckinGame(
	page: Page,
	gameName: string,
	weight: string
): Promise<void> {
	await page.goto(`/library?search=${encodeURIComponent(gameName)}&status=checked_out`);
	const row = tableRow(page, gameName).first();
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Check In' }).click();

	const dialog = page.locator('dialog.checkin-dialog');
	await expect(dialog).toBeVisible();
	await dialog.locator('#checkin-checkinWeight').fill(weight);
	await dialog.getByRole('button', { name: 'Confirm Check In' }).click();
	await expect(page.getByText('Game checked in successfully!')).toBeVisible();
}

// ── Fixture ────────────────────────────────────────────────────────────

/**
 * Extended test fixture that provides helpers for creating/cleaning up
 * test-specific data. Each test gets a unique prefix to avoid collisions.
 */
export const test = base.extend<{
	helpers: {
		/** Unique prefix for this test (use in game titles to avoid collisions) */
		prefix: string;
		/** Create a game via API. Automatically cleaned up after the test. */
		createGame: (title: string, opts?: { bggId?: number; gameType?: GameType }) => Promise<TestGame>;
		/** Checkout a game through the UI */
		checkoutGame: (gameName: string, firstName: string, lastName: string, weight: string) => Promise<void>;
		/** Checkin a game through the UI */
		checkinGame: (gameName: string, weight: string) => Promise<void>;
		/** Locate a table row by text content on the given page or locator */
		tableRow: (pageOrLocator: Page | Locator, text: string) => Locator;
	};
}>({
	helpers: async ({ page, request }, use, testInfo) => {
		const createdIds: number[] = [];
		// Short unique prefix: worker index + random suffix to avoid collisions across runs
		const prefix = `t${testInfo.parallelIndex}_${Date.now().toString(36).slice(-5)}_${Math.random().toString(36).slice(2, 6)}`;

		const helpers = {
			prefix,

			async createGame(title: string, opts?: { bggId?: number; gameType?: GameType }) {
				const game = await apiCreateGame(request, title, opts);
				createdIds.push(game.id);
				return game;
			},

			async checkoutGame(gameName: string, firstName: string, lastName: string, weight: string) {
				await uiCheckoutGame(page, gameName, firstName, lastName, weight);
			},

			async checkinGame(gameName: string, weight: string) {
				await uiCheckinGame(page, gameName, weight);
			},

			tableRow(pageOrLocator: Page | Locator, text: string): Locator {
				return tableRow(pageOrLocator, text);
			}
		};

		await use(helpers);

		// Cleanup: delete all games created during this test
		await apiDeleteGames(request, createdIds);
	}
});

export { expect } from '@playwright/test';
