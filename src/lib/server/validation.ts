// Server-side validation for all domain inputs

export type ValidationErrors = Record<string, string>;

export interface ValidationResult<T = unknown> {
	valid: boolean;
	errors: ValidationErrors;
	data?: T;
}

// --- Game Input ---

export interface GameInput {
	title: string;
	bggId: number;
	prizeType?: 'standard' | 'play_and_win' | 'play_and_take';
	shelfCategory?: 'family' | 'small' | 'standard';
}

const VALID_PRIZE_TYPES = ['standard', 'play_and_win', 'play_and_take'] as const;
const VALID_SHELF_CATEGORIES = ['family', 'small', 'standard'] as const;

export function validateGameInput(input: Partial<GameInput>): ValidationResult<GameInput> {
	const errors: ValidationErrors = {};

	if (!input.title || input.title.trim().length === 0) {
		errors.title = 'Title is required';
	}

	if (input.bggId == null) {
		errors.bggId = 'BGG ID is required';
	} else if (!Number.isInteger(input.bggId) || input.bggId <= 0) {
		errors.bggId = 'BGG ID must be a positive integer';
	}

	if (input.prizeType != null && !VALID_PRIZE_TYPES.includes(input.prizeType as typeof VALID_PRIZE_TYPES[number])) {
		errors.prizeType = 'Prize type must be standard, play_and_win, or play_and_take';
	}

	if (input.shelfCategory != null && !VALID_SHELF_CATEGORIES.includes(input.shelfCategory as typeof VALID_SHELF_CATEGORIES[number])) {
		errors.shelfCategory = 'Shelf category must be family, small, or standard';
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: {
			title: input.title!.trim(),
			bggId: input.bggId!,
			prizeType: input.prizeType ?? 'standard',
			shelfCategory: input.shelfCategory ?? 'standard'
		}
	};
}

// --- Attendee Input ---

export interface AttendeeInput {
	firstName: string;
	lastName: string;
	idType: string;
}

export function validateAttendeeInput(input: Partial<AttendeeInput>): ValidationResult<AttendeeInput> {
	const errors: ValidationErrors = {};

	if (!input.firstName || input.firstName.trim().length === 0) {
		errors.firstName = 'First name is required';
	} else if (input.firstName.trim().length > 100) {
		errors.firstName = 'First name must be 100 characters or fewer';
	}

	if (!input.lastName || input.lastName.trim().length === 0) {
		errors.lastName = 'Last name is required';
	} else if (input.lastName.trim().length > 100) {
		errors.lastName = 'Last name must be 100 characters or fewer';
	}

	if (!input.idType || input.idType.trim().length === 0) {
		errors.idType = 'ID type is required';
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: {
			firstName: input.firstName!.trim(),
			lastName: input.lastName!.trim(),
			idType: input.idType!.trim()
		}
	};
}

// --- Swap Input ---

export interface SwapInput {
	returnGameId: number;
	newGameId: number;
	checkinWeight: number;
	checkoutWeight: number;
}

export function validateSwapInput(input: Partial<SwapInput>): ValidationResult<SwapInput> {
	const errors: ValidationErrors = {};

	if (input.returnGameId == null || !Number.isInteger(input.returnGameId)) {
		errors.returnGameId = 'Return game ID is required and must be an integer';
	}

	if (input.newGameId == null || !Number.isInteger(input.newGameId)) {
		errors.newGameId = 'New game ID is required and must be an integer';
	}

	if (input.checkinWeight == null) {
		errors.checkinWeight = 'Checkin weight is required';
	} else if (typeof input.checkinWeight !== 'number' || !isFinite(input.checkinWeight) || input.checkinWeight <= 0) {
		errors.checkinWeight = 'Checkin weight must be a positive number';
	}

	if (input.checkoutWeight == null) {
		errors.checkoutWeight = 'Checkout weight is required';
	} else if (typeof input.checkoutWeight !== 'number' || !isFinite(input.checkoutWeight) || input.checkoutWeight <= 0) {
		errors.checkoutWeight = 'Checkout weight must be a positive number';
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: {
			returnGameId: input.returnGameId!,
			newGameId: input.newGameId!,
			checkinWeight: input.checkinWeight!,
			checkoutWeight: input.checkoutWeight!
		}
	};
}


// --- Checkout Input ---

export interface CheckoutInput {
	gameId: number;
	gameVersion: number;
	attendeeFirstName: string;
	attendeeLastName: string;
	idType: string;
	checkoutWeight: number;
	note?: string;
}

export function validateCheckoutInput(input: Partial<CheckoutInput>): ValidationResult<CheckoutInput> {
	const errors: ValidationErrors = {};

	if (input.gameId == null || !Number.isInteger(input.gameId)) {
		errors.gameId = 'Game ID is required';
	}

	if (input.gameVersion == null || !Number.isInteger(input.gameVersion)) {
		errors.gameVersion = 'Game version is required';
	}

	if (!input.attendeeFirstName || input.attendeeFirstName.trim().length === 0) {
		errors.attendeeFirstName = 'Attendee first name is required';
	}

	if (!input.attendeeLastName || input.attendeeLastName.trim().length === 0) {
		errors.attendeeLastName = 'Attendee last name is required';
	}

	if (!input.idType || input.idType.trim().length === 0) {
		errors.idType = 'ID type is required';
	}

	if (input.checkoutWeight == null) {
		errors.checkoutWeight = 'Checkout weight is required';
	} else if (typeof input.checkoutWeight !== 'number' || !isFinite(input.checkoutWeight) || input.checkoutWeight <= 0) {
		errors.checkoutWeight = 'Checkout weight must be a positive number';
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: {
			gameId: input.gameId!,
			gameVersion: input.gameVersion!,
			attendeeFirstName: input.attendeeFirstName!.trim(),
			attendeeLastName: input.attendeeLastName!.trim(),
			idType: input.idType!.trim(),
			checkoutWeight: input.checkoutWeight!,
			note: input.note?.trim() || undefined
		}
	};
}

// --- Checkin Input ---

export interface CheckinInput {
	gameId: number;
	checkinWeight: number;
	note?: string;
	attendeeTakesGame?: boolean;
}

export function validateCheckinInput(input: Partial<CheckinInput>): ValidationResult<CheckinInput> {
	const errors: ValidationErrors = {};

	if (input.gameId == null || !Number.isInteger(input.gameId)) {
		errors.gameId = 'Game ID is required';
	}

	if (input.checkinWeight == null) {
		errors.checkinWeight = 'Checkin weight is required';
	} else if (typeof input.checkinWeight !== 'number' || !isFinite(input.checkinWeight) || input.checkinWeight <= 0) {
		errors.checkinWeight = 'Checkin weight must be a positive number';
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: {
			gameId: input.gameId!,
			checkinWeight: input.checkinWeight!,
			note: input.note?.trim() || undefined,
			attendeeTakesGame: input.attendeeTakesGame ?? false
		}
	};
}

// --- Convention Config Input ---

export interface ConfigInput {
	conventionName?: string;
	startDate?: string | null;
	endDate?: string | null;
	weightTolerance?: number;
	weightUnit?: string;
}

const VALID_WEIGHT_UNITS = ['oz', 'kg', 'g'] as const;

export function validateConfigInput(input: Partial<ConfigInput>): ValidationResult<ConfigInput> {
	const errors: ValidationErrors = {};

	if (input.weightTolerance != null) {
		if (typeof input.weightTolerance !== 'number' || !isFinite(input.weightTolerance) || input.weightTolerance <= 0) {
			errors.weightTolerance = 'Weight tolerance must be a positive number';
		}
	}

	if (input.weightUnit != null && !VALID_WEIGHT_UNITS.includes(input.weightUnit as typeof VALID_WEIGHT_UNITS[number])) {
		errors.weightUnit = 'Weight unit must be oz, kg, or g';
	}

	if (input.startDate && input.endDate) {
		if (new Date(input.endDate) < new Date(input.startDate)) {
			errors.endDate = 'End date must be on or after the start date';
		}
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: {
			conventionName: input.conventionName?.trim(),
			startDate: input.startDate,
			endDate: input.endDate,
			weightTolerance: input.weightTolerance,
			weightUnit: input.weightUnit
		}
	};
}

// --- CSV Row Validation ---

export type CsvRowAction = 'add' | 'modify' | 'delete';

const VALID_CSV_ACTIONS: CsvRowAction[] = ['add', 'modify', 'delete'];

export interface CsvRow {
	action: CsvRowAction;
	title: string;
	bggId: number;
	copyCount: number;
	copyNumber?: number;
	prizeType?: 'standard' | 'play_and_win' | 'play_and_take';
	shelfCategory?: 'family' | 'small' | 'standard';
	newTitle?: string;
	newBggId?: number;
	sourceRow: number;
}

export interface CsvValidationResult {
	valid: boolean;
	errors: { row: number; message: string }[];
	rows: CsvRow[];
}

export function validateCsvRows(rows: Record<string, string>[]): CsvValidationResult {
	const errors: { row: number; message: string }[] = [];
	const parsed: CsvRow[] = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 1;

		// Parse action — defaults to 'add' for backward compatibility
		const rawAction = (row.action ?? 'add').trim().toLowerCase();
		if (!VALID_CSV_ACTIONS.includes(rawAction as CsvRowAction)) {
			errors.push({ row: rowNum, message: `Invalid action "${rawAction}". Must be add, modify, or delete` });
			continue;
		}
		const action = rawAction as CsvRowAction;

		const title = row.title?.trim();
		if (!title) {
			errors.push({ row: rowNum, message: 'Title is required' });
		}

		const bggId = Number(row.bgg_id ?? row.bggId ?? row.BGG_ID);
		if (!Number.isInteger(bggId) || bggId <= 0) {
			errors.push({ row: rowNum, message: 'BGG ID must be a positive integer' });
		}

		// Parse prize_type (accepts both prizeType and gameType as legacy alias, optional, defaults to 'standard' for add)
		const rawPrizeType = (row.prize_type ?? row.prizeType ?? row.game_type ?? row.gameType ?? row.game_Type ?? '').trim().toLowerCase();
		let prizeType: 'standard' | 'play_and_win' | 'play_and_take' | undefined;
		if (rawPrizeType) {
			if (!VALID_PRIZE_TYPES.includes(rawPrizeType as typeof VALID_PRIZE_TYPES[number])) {
				errors.push({ row: rowNum, message: `Invalid prize type "${rawPrizeType}". Must be standard, play_and_win, or play_and_take` });
			} else {
				prizeType = rawPrizeType as typeof VALID_PRIZE_TYPES[number];
			}
		}

		// Parse shelf_category (optional, defaults to 'standard' when omitted or empty)
		const rawShelfCategory = (row.shelf_category ?? row.shelfCategory ?? '').trim().toLowerCase();
		let shelfCategory: 'family' | 'small' | 'standard' | undefined;
		if (rawShelfCategory) {
			if (!VALID_SHELF_CATEGORIES.includes(rawShelfCategory as typeof VALID_SHELF_CATEGORIES[number])) {
				errors.push({ row: rowNum, message: `Invalid shelf category "${rawShelfCategory}". Must be family, small, or standard` });
			} else {
				shelfCategory = rawShelfCategory as typeof VALID_SHELF_CATEGORIES[number];
			}
		}

		if (action === 'add') {
			// For add: copy_count determines how many copies to create
			const copyCount = Number(row.copy_count ?? row.copyCount ?? row.copies ?? 1);
			if (!Number.isInteger(copyCount) || copyCount <= 0) {
				errors.push({ row: rowNum, message: 'Copy count must be a positive integer' });
			}

			if (title && Number.isInteger(bggId) && bggId > 0 && Number.isInteger(copyCount) && copyCount > 0) {
				parsed.push({
					action: 'add',
					title,
					bggId,
					copyCount,
					prizeType: prizeType ?? 'standard',
					shelfCategory: shelfCategory ?? 'standard',
					sourceRow: rowNum
				});
			}
		} else {
			// For modify/delete: copy_number identifies the specific game copy
			const copyNumber = Number(row.copy_number ?? row.copyNumber ?? '');
			if (!Number.isInteger(copyNumber) || copyNumber <= 0) {
				errors.push({ row: rowNum, message: `Copy number is required for ${action} action and must be a positive integer` });
			}

			// For modify: parse optional new values
			let newTitle: string | undefined;
			let newBggId: number | undefined;
			if (action === 'modify') {
				const rawNewTitle = (row.new_title ?? row.newTitle ?? '').trim();
				if (rawNewTitle) newTitle = rawNewTitle;

				const rawNewBggId = row.new_bgg_id ?? row.newBggId ?? row.new_BGG_ID ?? '';
				if (rawNewBggId) {
					const parsedNewBggId = Number(rawNewBggId);
					if (!Number.isInteger(parsedNewBggId) || parsedNewBggId <= 0) {
						errors.push({ row: rowNum, message: 'New BGG ID must be a positive integer' });
					} else {
						newBggId = parsedNewBggId;
					}
				}

				// At least one change must be specified for modify
				if (!prizeType && !shelfCategory && !newTitle && !newBggId) {
					errors.push({ row: rowNum, message: 'Modify action requires at least one change (prize_type, shelf_category, new_title, or new_bgg_id)' });
				}
			}

			if (title && Number.isInteger(bggId) && bggId > 0 && Number.isInteger(copyNumber) && copyNumber > 0) {
				parsed.push({
					action,
					title,
					bggId,
					copyCount: 1,
					copyNumber,
					prizeType,
					shelfCategory,
					newTitle,
					newBggId,
					sourceRow: rowNum
				});
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		rows: errors.length === 0 ? parsed : []
	};
}

// --- Weight Warning (re-exported from shared utils for backward compatibility) ---

export { getWeightWarningLevel, shouldWarnWeight, type WeightWarningLevel } from '$lib/utils/validation.js';

// --- Password Input ---

export interface PasswordInput {
	password: string;
	confirmation: string;
}

export function validatePasswordInput(input: PasswordInput): ValidationResult<{ password: string }> {
	const errors: ValidationErrors = {};

	if (!input.password || input.password.trim().length === 0) {
		errors.password = 'Password is required';
	}

	if (Object.keys(errors).length === 0 && input.password !== input.confirmation) {
		errors.confirmation = 'Passwords do not match';
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: { password: input.password }
	};
}

export interface PasswordChangeInput {
	currentPassword: string;
	newPassword: string;
	newPasswordConfirmation: string;
}

export function validatePasswordChangeInput(
	input: PasswordChangeInput
): ValidationResult<{ currentPassword: string; newPassword: string }> {
	const errors: ValidationErrors = {};

	if (!input.currentPassword || input.currentPassword.trim().length === 0) {
		errors.currentPassword = 'Current password is required';
	}

	if (!input.newPassword || input.newPassword.trim().length === 0) {
		errors.newPassword = 'New password is required';
	}

	if (Object.keys(errors).length === 0 && input.newPassword !== input.newPasswordConfirmation) {
		errors.newPasswordConfirmation = 'Passwords do not match';
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: {},
		data: {
			currentPassword: input.currentPassword,
			newPassword: input.newPassword
		}
	};
}

// --- Error Classes ---

export class ValidationError extends Error {
	errors: Record<string, string>;

	constructor(errors: Record<string, string>) {
		super('Validation failed');
		this.name = 'ValidationError';
		this.errors = errors;
	}
}
