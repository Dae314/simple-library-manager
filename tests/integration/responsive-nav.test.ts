import { test, expect } from './fixtures';

test.describe('Responsive Navigation', () => {
	test.describe('Desktop viewport (1280×720)', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize({ width: 1280, height: 720 });
			await page.goto('/');
		});

		test('nav links are visible with Library and Manage', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');
			await expect(nav).toBeVisible();

			const navLinks = nav.locator('.nav-links');
			await expect(navLinks.locator('a.nav-link', { hasText: 'Library' })).toBeVisible();
			await expect(navLinks.locator('a.nav-link', { hasText: 'Manage' })).toBeVisible();
		});

		test('Manage link has gear icon', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');
			const manageLink = nav.locator('.nav-links a.manage-link', { hasText: 'Manage' });
			await expect(manageLink).toBeVisible();
			await expect(manageLink.locator('svg.gear-icon')).toBeVisible();
		});

		test('hamburger button is not visible', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await expect(hamburger).not.toBeVisible();
		});

		test('clicking nav links navigates to correct pages', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');

			await nav.locator('.nav-links a.nav-link', { hasText: 'Library' }).click();
			await expect(page).toHaveURL(/\/library/);

			await nav.locator('.nav-links a.nav-link', { hasText: 'Manage' }).click();
			await expect(page).toHaveURL(/\/management/);
		});

		test('brand link navigates to landing page', async ({ page }) => {
			await page.goto('/library');
			const nav = page.locator('nav[aria-label="Main navigation"]');
			await nav.locator('a.brand').click();
			await expect(page).toHaveURL(/\/$/);
		});

		test('active page is highlighted', async ({ page }) => {
			await page.goto('/library');
			const nav = page.locator('nav[aria-label="Main navigation"]');
			const libraryLink = nav.locator('.nav-links a.nav-link', { hasText: 'Library' });
			await expect(libraryLink).toHaveClass(/active/);

			await expect(nav.locator('.nav-links a.nav-link', { hasText: 'Manage' })).not.toHaveClass(/active/);
		});
	});

	test.describe('Mobile viewport (375×667)', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 });
			await page.goto('/');
		});

		test('nav-links are not visible on mobile', async ({ page }) => {
			const navLinks = page.locator('.nav-links');
			await expect(navLinks).not.toBeVisible();
		});

		test('hamburger button is visible', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await expect(hamburger).toBeVisible();
			await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
		});

		test('clicking hamburger opens mobile menu with Library and Manage links', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await hamburger.click();

			await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

			const mobileMenu = page.locator('#mobile-menu[role="menu"]');
			await expect(mobileMenu).toBeVisible();

			await expect(mobileMenu.locator('a[role="menuitem"]', { hasText: 'Library' })).toBeVisible();
			await expect(mobileMenu.locator('a[role="menuitem"]', { hasText: 'Manage' })).toBeVisible();
		});

		test('mobile Manage link has gear icon', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await hamburger.click();

			const mobileMenu = page.locator('#mobile-menu[role="menu"]');
			const manageLink = mobileMenu.locator('a[role="menuitem"]', { hasText: 'Manage' });
			await expect(manageLink).toBeVisible();
			await expect(manageLink.locator('svg.gear-icon')).toBeVisible();
		});

		test('clicking a mobile menu link navigates and closes the menu', async ({ page }) => {
			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await hamburger.click();

			const mobileMenu = page.locator('#mobile-menu[role="menu"]');
			await expect(mobileMenu).toBeVisible();

			await mobileMenu.locator('a[role="menuitem"]', { hasText: 'Library' }).click();
			await expect(page).toHaveURL(/\/library/);

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

		test('behaves like desktop — Library and Manage links visible, no hamburger', async ({ page }) => {
			const nav = page.locator('nav[aria-label="Main navigation"]');

			const navLinks = nav.locator('.nav-links');
			await expect(navLinks.locator('a.nav-link', { hasText: 'Library' })).toBeVisible();
			await expect(navLinks.locator('a.nav-link', { hasText: 'Manage' })).toBeVisible();

			// Verify gear icon on Manage link
			const manageLink = navLinks.locator('a.manage-link', { hasText: 'Manage' });
			await expect(manageLink.locator('svg.gear-icon')).toBeVisible();

			const hamburger = page.getByRole('button', { name: 'Toggle navigation menu' });
			await expect(hamburger).not.toBeVisible();
		});
	});
});
