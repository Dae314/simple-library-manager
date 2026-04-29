import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/integration',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 4,
	reporter: 'list',
	timeout: 30_000,
	expect: {
		timeout: 5_000
	},
	use: {
		baseURL: 'http://localhost:8080',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
