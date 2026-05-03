import type { PageServerLoad, Actions } from './$types';
import { transactionService } from '$lib/server/services/transactions.js';
import type { TransactionFilters, TransactionSortParams } from '$lib/server/services/transactions.js';
import { fail } from '@sveltejs/kit';
import { broadcastGameEvent, broadcastTransactionEvent } from '$lib/server/ws/broadcast.js';

export const load: PageServerLoad = async ({ url }) => {
	const gameTitle = url.searchParams.get('gameTitle') || '';
	const type = url.searchParams.get('type') || '';
	const attendeeName = url.searchParams.get('attendeeName') || '';
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);
	const sortField = url.searchParams.get('sortField') || 'created_at';
	const sortDir = url.searchParams.get('sortDir') || 'desc';

	const filters: TransactionFilters = {};

	if (gameTitle) {
		filters.gameTitle = gameTitle;
	}
	if (type === 'checkout' || type === 'checkin') {
		filters.type = type;
	}
	if (attendeeName) {
		filters.attendeeName = attendeeName;
	}

	const validSortFields = ['created_at', 'game_title', 'type', 'attendee'] as const;
	const sort: TransactionSortParams = {
		field: validSortFields.includes(sortField as any) ? (sortField as TransactionSortParams['field']) : 'created_at',
		direction: sortDir === 'desc' ? 'desc' : 'asc'
	};

	const transactions = await transactionService.list(filters, { page, pageSize }, sort);

	return {
		transactions,
		filters: {
			gameTitle,
			type,
			attendeeName,
			page,
			pageSize
		},
		sortField: sort.field,
		sortDir: sort.direction
	};
};

export const actions: Actions = {
	reverseCheckout: async ({ request }) => {
		const formData = await request.formData();
		const transactionId = Number(formData.get('transactionId'));

		if (!transactionId || isNaN(transactionId)) {
			return fail(400, { error: 'Invalid transaction ID' });
		}

		try {
			const result = await transactionService.reverseCheckout(transactionId);
			broadcastGameEvent('game_checked_in', result.gameId);
			broadcastTransactionEvent(result.correctionTransactionId, result.gameId);
			return { success: true, action: 'reverseCheckout' };
		} catch (e: any) {
			const message = e?.message || 'Failed to reverse checkout';
			if (message.includes('Conflict')) {
				return fail(409, { error: message });
			}
			return fail(500, { error: message });
		}
	},

	reverseCheckin: async ({ request }) => {
		const formData = await request.formData();
		const transactionId = Number(formData.get('transactionId'));

		if (!transactionId || isNaN(transactionId)) {
			return fail(400, { error: 'Invalid transaction ID' });
		}

		try {
			const result = await transactionService.reverseCheckin(transactionId);
			broadcastGameEvent('game_checked_out', result.gameId);
			broadcastTransactionEvent(result.correctionTransactionId, result.gameId);
			return { success: true, action: 'reverseCheckin' };
		} catch (e: any) {
			const message = e?.message || 'Failed to reverse checkin';
			if (message.includes('Conflict')) {
				return fail(409, { error: message });
			}
			return fail(500, { error: message });
		}
	}
};
