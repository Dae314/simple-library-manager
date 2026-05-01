import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { backupService } from '$lib/server/services/backup.js';
import { broadcastFullResync } from '$lib/server/ws/broadcast.js';

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
