import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { backupService } from '$lib/server/services/backup.js';
import { broadcastFullResync } from '$lib/server/ws/broadcast.js';
import { configService } from '$lib/server/services/config.js';
import { authService } from '$lib/server/services/auth.js';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	import: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('backupFile') as File | null;

		if (!file || file.size === 0) {
			return fail(400, { error: 'Please select a backup file to import' });
		}

		// Password confirmation check when password is set
		const passwordHash = await configService.getPasswordHash();
		if (passwordHash) {
			const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';
			if (!confirmPassword) {
				return fail(400, { error: 'Password confirmation is required' });
			}
			const isValid = await authService.verifyPassword(confirmPassword, passwordHash);
			if (!isValid) {
				return fail(400, { error: 'Incorrect password' });
			}
		}

		try {
			await backupService.importDatabase(file);
			broadcastFullResync();
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			return fail(400, { error: message });
		}
	}
};
