import type { PageServerLoad, Actions } from './$types';
import { attendeeService } from '$lib/server/services/attendees.js';
import type { AttendeeFilters, AttendeeSortParams } from '$lib/server/services/attendees.js';
import { configService } from '$lib/server/services/config.js';
import { fail } from '@sveltejs/kit';
import { broadcastAttendeeEvent } from '$lib/server/ws/broadcast.js';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search') || '';
	const idType = url.searchParams.get('idType') || '';
	const sortField = url.searchParams.get('sortField') || 'last_name';
	const sortDir = url.searchParams.get('sortDir') || 'asc';
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

	const filters: AttendeeFilters = {};

	if (search) {
		filters.search = search.slice(0, 100);
	}
	if (idType) {
		filters.idType = idType;
	}

	const validSortFields = ['first_name', 'last_name', 'id_type', 'transaction_count'] as const;
	const sort: AttendeeSortParams = {
		field: validSortFields.includes(sortField as any) ? (sortField as AttendeeSortParams['field']) : 'last_name',
		direction: sortDir === 'desc' ? 'desc' : 'asc'
	};

	const attendees = await attendeeService.list(filters, { page, pageSize }, sort);
	const idTypes = await configService.getIdTypes();

	return {
		attendees,
		idTypes,
		filters: {
			search: filters.search || '',
			idType,
			sortField: sort.field,
			sortDir: sort.direction,
			page,
			pageSize
		}
	};
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id || isNaN(id)) {
			return fail(400, { error: 'Invalid attendee ID' });
		}

		// Check if attendee exists
		const attendee = await attendeeService.getById(id);
		if (!attendee) {
			return fail(404, { error: 'Attendee not found' });
		}

		// Check for active checkouts
		const hasActive = await attendeeService.hasActiveCheckouts(id);
		if (hasActive) {
			return fail(400, { error: 'Cannot delete attendee with active checkouts. Please check in all games first.' });
		}

		try {
			await attendeeService.delete(id);
			broadcastAttendeeEvent('attendee_deleted', id);
			return { success: true, action: 'delete' };
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to delete attendee';
			return fail(500, { error: message });
		}
	}
};
