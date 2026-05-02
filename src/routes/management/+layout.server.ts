import type { LayoutServerLoad } from './$types';
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
