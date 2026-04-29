import { test as base } from '@playwright/test';

// Reset database before each test to ensure clean state
// This is needed because tests modify shared database state
export const test = base.extend({
	page: async ({ page }, use) => {
		const response = await page.request.post('http://localhost:8080/api/test-reset');
		if (!response.ok()) {
			console.warn('Failed to reset database:', await response.text());
		}
		// Small delay to ensure DB state is fully committed
		await new Promise(r => setTimeout(r, 100));
		await use(page);
	}
});

export { expect } from '@playwright/test';
