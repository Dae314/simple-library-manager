import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	ALLOW_TEST_RESET: {
		description: 'Set to "true" to enable the test-only /api/test-helpers and /api/test-reset endpoints',
		// Unset falls back to '' so the routes' `!== 'true'` guard keeps them disabled.
		schema: (input) => input ?? ''
	}
});
