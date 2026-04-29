import { test, expect } from './fixtures';

test.describe('Responsive Navigation', () => {
	test.describe('Desktop viewport (1280×720)', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize({ width: 1280, height: 720 });
			await page.goto('/');
		});

		test('all nav links are visible', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');
			await expect(nav).toBeVisible();

			await expect(nav.locator('a.nav-link', { hasText: 'Checkout' })).toBeVisible();
			await expect(nav.locator('a.nav-link', { hasText: 'Checkin' })).toBeVisible();

			const desktopLinks = nav.locator('.desktop-links');
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Catalog' })).toBeVisible();
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Statistics' })).toBeVisible();
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Management' })).toBeVisible();
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Config' })).toBeVisible();
		});

		test('hamburger button is not visible', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await expect(hamburger).not.toBeVisible();
		});

		test('clicking nav links navigates to correct pages', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');

			await nav.locator('a.nav-link', { hasText: 'Checkout' }).click();
			await expect(page).toHaveURL(/\/checkout/);

			await nav.locator('a.nav-link', { hasText: 'Checkin' }).click();
			await expect(page).toHaveURL(/\/checkin/);

			await nav.locator('.desktop-links a.nav-link', { hasText: 'Catalog' }).click();
			await expect(page).toHaveURL(/\/catalog/);

			await nav.locator('.desktop-links a.nav-link', { hasText: 'Statistics' }).click();
			await expect(page).toHaveURL(/\/statistics/);
		});

		test('active page is highlighted', async ({ page }) => {
			await page.goto('/checkout');
			const nav = page.locator('nav[aria-label="Main navigation"]');
			const checkoutLink = nav.locator('a.nav-link', { hasText: 'Checkout' });
			await expect(checkoutLink).toHaveClass(/active/);

			await expect(nav.locator('a.nav-link', { hasText: 'Checkin' })).not.toHaveClass(/active/);
		});
	});

	test.describe('Mobile viewport (375×667)', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 });
			await page.goto('/');
		});

		test('primary links are visible', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');
			await expect(nav.locator('a.nav-link', { hasText: 'Checkout' })).toBeVisible();
			await expect(nav.locator('a.nav-link', { hasText: 'Checkin' })).toBeVisible();
		});

		test('secondary desktop links are not visible', async ({ page }) => {
			const desktopLinks = page.locator('.desktop-links');
			await expect(desktopLinks).not.toBeVisible();
		});

		test('hamburger button is visible', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await expect(hamburger).toBeVisible();
			await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
		});

		test('clicking hamburger opens mobile menu with secondary links', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await hamburger.click();

			await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

			const mobileMenu = page.locator('#mobile-menu[role="menu"]');
			await expect(mobileMenu).toBeVisible();

			await expect(mobileMenu.locator('a[role="menuitem"]', { hasText: 'Catalog' })).toBeVisible();
			await expect(mobileMenu.locator('a[role="menuitem"]', { hasText: 'Statistics' })).toBeVisible();
			await expect(mobileMenu.locator('a[role="menuitem"]', { hasText: 'Management' })).toBeVisible();
			await expect(mobileMenu.locator('a[role="menuitem"]', { hasText: 'Config' })).toBeVisible();
		});

		test('clicking a mobile menu link navigates and closes the menu', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await hamburger.click();

			const mobileMenu = page.locator('#mobile-menu[role="menu"]');
			await expect(mobileMenu).toBeVisible();

			await mobileMenu.locator('a[role="menuitem"]', { hasText: 'Catalog' }).click();
			await expect(page).toHaveURL(/\/catalog/);

			await expect(page.locator('#mobile-menu')).not.toBeVisible();
		});

		test('clicking hamburger again closes the menu', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });

			await hamburger.click();
			await expect(page.locator('#mobile-menu[role="menu"]')).toBeVisible();
			await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

			await hamburger.click();
			await expect(page.locator('#mobile-menu')).not.toBeVisible();
			await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
		});
	});

	test.describe('Tablet viewport (768×1024)', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize({ width: 768, height: 1024 });
			await page.goto('/');
		});

		test('behaves like desktop — all links visible, no hamburger', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');

			await expect(nav.locator('a.nav-link', { hasText: 'Checkout' })).toBeVisible();
			await expect(nav.locator('a.nav-link', { hasText: 'Checkin' })).toBeVisible();

			const desktopLinks = nav.locator('.desktop-links');
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Catalog' })).toBeVisible();
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Statistics' })).toBeVisible();
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Management' })).toBeVisible();
			await expect(desktopLinks.locator('a.nav-link', { hasText: 'Config' })).toBeVisible();

			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await expect(hamburger).not.toBeVisible();
		});
	});
});
