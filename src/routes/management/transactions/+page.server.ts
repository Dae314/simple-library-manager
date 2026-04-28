import type { PageServerLoad, Actions } from './$types';
import { transactionService } from '$lib/server/services/transactions.js';
import type { TransactionFilters } from '$lib/server/services/transactions.js';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url }) => {
	const gameTitle = url.searchParams.get('gameTitle') || '';
	const type = url.searchParams.get('type') || '';
	const attendeeName = url.searchParams.get('attendeeName') || '';
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

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

	const transactions = await transactionService.list(filters, { page, pageSize });

	return {
		transactions,
		filters: {
			gameTitle,
			type,
			attendeeName,
			page,
			pageSize
		}
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
			await transactionService.reverseCheckout(transactionId);
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
			await transactionService.reverseCheckin(transactionId);
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
