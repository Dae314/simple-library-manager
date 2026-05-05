import { test, expect } from './fixtures';

const BASE = 'http://localhost:8080';

test.describe('Landing Page', () => {
	// Ensure convention name is set before testing the landing page
	test.beforeAll(async ({ request }) => {
		await request.post(`${BASE}/api/test-helpers`, {
			data: { action: 'updateConfig', conventionName: 'Board Game Library' }
		});
	});

	test('displays convention name heading', async ({ page }) => {
		await page.goto('/');

		const heading = page.locator('h1.convention-name');
		await expect(heading).toBeVisible();
		// Convention name should be a non-empty string from config
		await expect(heading).not.toHaveText('');
	});

	test('displays hero image', async ({ page }) => {
		await page.goto('/');

		const heroImage = page.locator('img.hero-image');
		await expect(heroImage).toBeVisible();
		await expect(heroImage).toHaveAttribute('src', '/hero.svg');
	});

	test('displays "Browse the Library" CTA', async ({ page }) => {
		await page.goto('/');

		const cta = page.locator('a.cta-button');
		await expect(cta).toBeVisible();
		await expect(cta).toHaveText('Browse the Library');
		await expect(cta).toHaveAttribute('href', '/library');
	});

	test('CTA navigates to /library', async ({ page }) => {
		await page.goto('/');

		const cta = page.locator('a.cta-button');
		await cta.click();
		await expect(page).toHaveURL(/\/library/);
	});
});

test.describe('Legacy routes return 404', () => {
	test('/checkout returns 404', async ({ page }) => {
		const response = await page.goto('/checkout');
		expect(response?.status()).toBe(404);
	});

	test('/checkin returns 404', async ({ page }) => {
		const response = await page.goto('/checkin');
		expect(response?.status()).toBe(404);
	});

	test('/catalog returns 404', async ({ page }) => {
		const response = await page.goto('/catalog');
		expect(response?.status()).toBe(404);
	});
});
