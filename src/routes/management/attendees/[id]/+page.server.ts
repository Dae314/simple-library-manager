import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { attendeeService } from '$lib/server/services/attendees.js';
import { configService } from '$lib/server/services/config.js';
import { validateAttendeeInput } from '$lib/server/validation.js';
import { broadcastAttendeeEvent } from '$lib/server/ws/broadcast.js';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) {
		error(404, 'Attendee not found');
	}

	const attendee = await attendeeService.getById(id);
	if (!attendee) {
		error(404, 'Attendee not found');
	}

	const idTypes = await configService.getIdTypes();

	return { attendee, idTypes };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = parseInt(params.id, 10);
		const formData = await request.formData();

		const firstName = formData.get('firstName')?.toString() || '';
		const lastName = formData.get('lastName')?.toString() || '';
		const idType = formData.get('idType')?.toString() || '';

		const values = { firstName, lastName, idType };

		const validation = validateAttendeeInput({ firstName, lastName, idType });

		if (!validation.valid) {
			return fail(400, { errors: validation.errors, values });
		}

		try {
			await attendeeService.update(id, validation.data!);
			broadcastAttendeeEvent('attendee_updated', id);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('name combination already exists')) {
				return fail(400, {
					errors: { firstName: 'Name combination already exists' },
					values
				});
			}
			return fail(500, { error: message, values });
		}

		redirect(303, '/management/attendees');
	}
};
