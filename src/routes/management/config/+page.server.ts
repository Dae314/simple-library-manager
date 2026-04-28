import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { configService } from '$lib/server/services/config.js';
import { ValidationError } from '$lib/server/validation.js';
import { db } from '$lib/server/db/index.js';
import { idTypes } from '$lib/server/db/schema.js';

export const load: PageServerLoad = async () => {
	const config = await configService.get();
	const idTypeRows = await db.select().from(idTypes);
	return { config, idTypes: idTypeRows };
};

export const actions: Actions = {
	updateConfig: async ({ request }) => {
		const formData = await request.formData();

		const conventionName = formData.get('conventionName')?.toString() ?? '';
		const startDate = formData.get('startDate')?.toString() || null;
		const endDate = formData.get('endDate')?.toString() || null;
		const rawTolerance = formData.get('weightTolerance')?.toString();
		const weightUnit = formData.get('weightUnit')?.toString() ?? 'oz';
		const version = parseInt(formData.get('version')?.toString() ?? '1', 10);

		const weightTolerance = rawTolerance ? parseFloat(rawTolerance) : undefined;

		try {
			await configService.update(
				{
					conventionName,
					startDate,
					endDate,
					weightTolerance: weightTolerance !== undefined && !isNaN(weightTolerance) ? weightTolerance : undefined,
					weightUnit
				},
				version
			);
			return { success: true };
		} catch (err) {
			if (err instanceof ValidationError) {
				return fail(400, {
					configErrors: err.errors,
					configValues: { conventionName, startDate, endDate, weightTolerance: rawTolerance, weightUnit }
				});
			}
			throw err;
		}
	},

	addIdType: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString() ?? '';

		try {
			await configService.addIdType(name);
			return { idTypeAdded: true };
		} catch (err) {
			if (err instanceof ValidationError) {
				return fail(400, { idTypeErrors: err.errors, idTypeValue: name });
			}
			throw err;
		}
	},

	removeIdType: async ({ request }) => {
		const formData = await request.formData();
		const id = parseInt(formData.get('id')?.toString() ?? '', 10);

		if (isNaN(id)) {
			return fail(400, { idTypeErrors: { id: 'Invalid ID type' } });
		}

		try {
			await configService.removeIdType(id);
			return { idTypeRemoved: true };
		} catch (err) {
			return fail(400, { idTypeErrors: { id: 'Failed to remove ID type' } });
		}
	}
};
