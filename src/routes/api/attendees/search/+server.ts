import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { attendeeService } from '$lib/server/services/attendees.js';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const field = url.searchParams.get('field');

	// Validate field parameter
	if (field !== 'firstName' && field !== 'lastName') {
		return json({ error: 'Invalid field parameter. Must be "firstName" or "lastName".' }, { status: 400 });
	}

	// Require minimum 2-character query
	if (q.length < 2) {
		return json({ suggestions: [] });
	}

	try {
		const suggestions = await attendeeService.searchByPrefix(q, field);
		return json({ suggestions });
	} catch {
		// Suppress errors silently per design — return empty suggestions
		return json({ suggestions: [] });
	}
};
