import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { configService } from '$lib/server/services/config.js';
import { authService } from '$lib/server/services/auth.js';
import { ValidationError, validatePasswordInput, validatePasswordChangeInput } from '$lib/server/validation.js';
import { getUserFriendlyDbMessage } from '$lib/server/services/db-errors.js';
import { db } from '$lib/server/db/index.js';
import { idTypes } from '$lib/server/db/schema.js';

const COOKIE_NAME = 'mgmt_session';

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

		const weightTolerance = rawTolerance !== undefined && rawTolerance !== '' ? parseFloat(rawTolerance) : undefined;

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
			return fail(500, {
				configError: getUserFriendlyDbMessage(err),
				configValues: { conventionName, startDate, endDate, weightTolerance: rawTolerance, weightUnit }
			});
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
			return fail(500, { idTypeErrors: { name: getUserFriendlyDbMessage(err) }, idTypeValue: name });
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
			return fail(500, { removeError: getUserFriendlyDbMessage(err) });
		}
	},

	setPassword: async ({ request, cookies }) => {
		const formData = await request.formData();
		const password = formData.get('password')?.toString() ?? '';
		const confirmation = formData.get('confirmation')?.toString() ?? '';

		const validation = validatePasswordInput({ password, confirmation });
		if (!validation.valid) {
			return fail(400, { passwordErrors: validation.errors });
		}

		try {
			const hash = await authService.hashPassword(validation.data!.password);
			await configService.setPassword(hash);

			// Create session so the organizer is not immediately locked out
			const cookieValue = authService.createSessionCookie();
			cookies.set(COOKIE_NAME, cookieValue, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: false
			});

			return { passwordSet: true };
		} catch (err) {
			return fail(500, { passwordError: 'An error occurred. Please try again.' });
		}
	},

	changePassword: async ({ request }) => {
		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword')?.toString() ?? '';
		const newPassword = formData.get('newPassword')?.toString() ?? '';
		const newPasswordConfirmation = formData.get('newPasswordConfirmation')?.toString() ?? '';

		const validation = validatePasswordChangeInput({ currentPassword, newPassword, newPasswordConfirmation });
		if (!validation.valid) {
			return fail(400, { changePasswordErrors: validation.errors });
		}

		try {
			const passwordHash = await configService.getPasswordHash();
			if (!passwordHash) {
				return fail(400, { changePasswordErrors: { currentPassword: 'No password is currently set' } });
			}

			const isValid = await authService.verifyPassword(validation.data!.currentPassword, passwordHash);
			if (!isValid) {
				return fail(400, { changePasswordErrors: { currentPassword: 'Current password is incorrect' } });
			}

			const newHash = await authService.hashPassword(validation.data!.newPassword);
			await configService.changePassword(newHash);

			return { passwordChanged: true };
		} catch (err) {
			return fail(500, { passwordError: 'An error occurred. Please try again.' });
		}
	},

	removePassword: async ({ request, cookies }) => {
		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword')?.toString() ?? '';

		if (!currentPassword || currentPassword.trim().length === 0) {
			return fail(400, { removePasswordErrors: { currentPassword: 'Current password is required' } });
		}

		try {
			const passwordHash = await configService.getPasswordHash();
			if (!passwordHash) {
				return fail(400, { removePasswordErrors: { currentPassword: 'No password is currently set' } });
			}

			const isValid = await authService.verifyPassword(currentPassword, passwordHash);
			if (!isValid) {
				return fail(400, { removePasswordErrors: { currentPassword: 'Current password is incorrect' } });
			}

			await configService.removePassword();

			// Clear the session cookie since it's no longer needed
			cookies.delete(COOKIE_NAME, { path: '/' });

			return { passwordRemoved: true };
		} catch (err) {
			return fail(500, { passwordError: 'An error occurred. Please try again.' });
		}
	}
};
