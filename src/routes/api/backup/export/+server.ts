import type { RequestHandler } from './$types';
import { backupService } from '$lib/server/services/backup.js';

export const GET: RequestHandler = async () => {
	try {
		const stream = await backupService.exportDatabase();
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

		return new Response(stream, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="backup-${timestamp}.dump"`
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
