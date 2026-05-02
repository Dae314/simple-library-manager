import type { RequestHandler } from './$types';
import { backupService } from '$lib/server/services/backup.js';
import { configService } from '$lib/server/services/config.js';
import { authService } from '$lib/server/services/auth.js';

export const GET: RequestHandler = async ({ cookies }) => {
	// Auth check: if password is set, require a valid session
	const passwordHash = await configService.getPasswordHash();
	if (passwordHash) {
		const sessionCookie = cookies.get('mgmt_session') ?? '';
		if (!authService.verifySessionCookie(sessionCookie)) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

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
