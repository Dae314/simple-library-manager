import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { webSocketPlugin } from './src/lib/server/ws/vite-plugin.js';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ out: 'build' }),
			csrf: { trustedOrigins: ['*'] }
		}),
		webSocketPlugin()
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}', 'tests/**/*.prop.test.{js,ts}'],
		exclude: ['tests/integration/**', 'node_modules/**']
	}
});
