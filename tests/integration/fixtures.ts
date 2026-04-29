import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

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

// ── UI helpers ─────────────────────────────────────────────────────────

async function uiCheckoutGame(
	page: Page,
	gameName: string,
	firstName: string,
	lastName: string,
	weight: string
): Promise<void> {
	await page.goto(`/checkout?search=${encodeURIComponent(gameName)}`);
	const card = page.locator('.game-card', { hasText: gameName }).first();
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Checkout' }).click();

	const form = page.locator('section[aria-label="Checkout form"]');
	await expect(form).toBeVisible();
	await form.locator('#attendeeFirstName').fill(firstName);
	await form.locator('#attendeeLastName').fill(lastName);
	await form.locator('#idType').selectOption({ index: 1 });
	await form.locator('#checkoutWeight').fill(weight);
	await form.getByRole('button', { name: 'Confirm Checkout' }).click();
	await expect(page.getByText('Game checked out successfully!')).toBeVisible();
}

async function uiCheckinGame(
	page: Page,
	gameName: string,
	weight: string
): Promise<void> {
	await page.goto('/checkin');
	const card = page.locator('.game-card', { hasText: gameName }).first();
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Check In' }).click();

	const form = page.locator('section[aria-label="Check in form"]');
	await expect(form).toBeVisible();
	await form.locator('#checkinWeight').fill(weight);
	await form.getByRole('button', { name: 'Confirm Check In' }).click();
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
			}
		};

		await use(helpers);

		// Cleanup: delete all games created during this test
		await apiDeleteGames(request, createdIds);
	}
});

export { expect } from '@playwright/test';
