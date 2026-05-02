import type { Actions, LayoutServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { configService } from '$lib/server/services/config.js';
import { authService } from '$lib/server/services/auth.js';

const COOKIE_NAME = 'mgmt_session';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const passwordHash = await configService.getPasswordHash();

	if (!passwordHash) {
		return { isPasswordSet: false, isAuthenticated: true };
	}

	const isAuthenticated = authService.verifySessionCookie(cookies.get(COOKIE_NAME) ?? '');

	return { isPasswordSet: true, isAuthenticated };
};

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress }) => {
		const clientIp = getClientAddress();

		// Apply rate limit delay (async, does not block event loop)
		const delay = authService.getRateLimitDelay(clientIp);
		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		const formData = await request.formData();
		const password = formData.get('password')?.toString() ?? '';

		const passwordHash = await configService.getPasswordHash();

		if (!passwordHash) {
			// No password set — nothing to authenticate against
			return { success: true };
		}

		const isValid = await authService.verifyPassword(password, passwordHash);

		if (!isValid) {
			authService.recordFailedAttempt(clientIp);
			return fail(400, { loginError: 'Incorrect password' });
		}

		// Success: create session cookie and reset rate limit
		authService.resetRateLimit(clientIp);
		const cookieValue = authService.createSessionCookie();
		cookies.set(COOKIE_NAME, cookieValue, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false
		});

		return { success: true };
	}
};
