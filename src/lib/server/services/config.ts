import { db } from '../db/index.js';
import { conventionConfig, idTypes } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { validateConfigInput, ValidationError, type ConfigInput } from '../validation.js';
import { isDuplicateKeyError } from './db-errors.js';

// --- Types ---

export interface ConventionConfig {
	id: number;
	conventionName: string;
	startDate: string | null;
	endDate: string | null;
	weightTolerance: number;
	weightUnit: string;
	version: number;
}

const DEFAULT_CONFIG = {
	conventionName: '',
	startDate: null,
	endDate: null,
	weightTolerance: 0.5,
	weightUnit: 'oz'
} as const;

/** Column projection that excludes passwordHash from query results */
const configColumns = {
	id: conventionConfig.id,
	conventionName: conventionConfig.conventionName,
	startDate: conventionConfig.startDate,
	endDate: conventionConfig.endDate,
	weightTolerance: conventionConfig.weightTolerance,
	weightUnit: conventionConfig.weightUnit,
	version: conventionConfig.version
} as const;

// --- Config Service ---

export const configService = {
	/**
	 * Get convention config (singleton row, id=1).
	 * If no row exists, create one with defaults and return it.
	 */
	async get(): Promise<ConventionConfig> {
		const [existing] = await db
			.select(configColumns)
			.from(conventionConfig)
			.where(eq(conventionConfig.id, 1));

		if (existing) {
			return existing;
		}

		// Create default config row
		const [created] = await db
			.insert(conventionConfig)
			.values({
				conventionName: DEFAULT_CONFIG.conventionName,
				startDate: DEFAULT_CONFIG.startDate,
				endDate: DEFAULT_CONFIG.endDate,
				weightTolerance: DEFAULT_CONFIG.weightTolerance,
				weightUnit: DEFAULT_CONFIG.weightUnit
			})
			.returning(configColumns);

		return created;
	},

	/**
	 * Update convention config with optimistic locking.
	 * Validates input and increments version on update.
	 */
	async update(data: ConfigInput, version: number): Promise<ConventionConfig> {
		const validation = validateConfigInput(data);
		if (!validation.valid) {
			throw new ValidationError(validation.errors);
		}

		const updateValues: Record<string, unknown> = {};

		if (data.conventionName !== undefined) {
			updateValues.conventionName = data.conventionName?.trim() ?? '';
		}
		if (data.startDate !== undefined) {
			updateValues.startDate = data.startDate;
		}
		if (data.endDate !== undefined) {
			updateValues.endDate = data.endDate;
		}
		if (data.weightTolerance !== undefined) {
			updateValues.weightTolerance = data.weightTolerance;
		}
		if (data.weightUnit !== undefined) {
			updateValues.weightUnit = data.weightUnit;
		}

		const [updated] = await db
			.update(conventionConfig)
			.set({
				...updateValues,
				version: sql`${conventionConfig.version} + 1`
			})
			.where(
				eq(conventionConfig.id, 1)
			)
			.returning(configColumns);

		if (!updated) {
			throw new Error('Convention config not found');
		}

		return updated;
	},

	/**
	 * List all ID types, return string array of names.
	 */
	async getIdTypes(): Promise<string[]> {
		const rows = await db
			.select({ name: idTypes.name })
			.from(idTypes);

		return rows.map((r) => r.name);
	},

	/**
	 * Insert a new ID type. Handle unique constraint violation gracefully.
	 */
	async addIdType(name: string): Promise<void> {
		const trimmed = name.trim();
		if (!trimmed) {
			throw new ValidationError({ name: 'ID type name is required' });
		}

		try {
			await db.insert(idTypes).values({ name: trimmed });
		} catch (err: unknown) {
			if (isDuplicateKeyError(err)) {
				throw new ValidationError({ name: `"${trimmed}" already exists` });
			}
			throw err;
		}
	},

	/**
	 * Delete an ID type by id.
	 */
	async removeIdType(id: number): Promise<void> {
		const [deleted] = await db
			.delete(idTypes)
			.where(eq(idTypes.id, id))
			.returning();

		if (!deleted) {
			throw new Error(`ID type with id ${id} not found`);
		}
	},

	/**
	 * Get the password hash from convention config.
	 * Returns null if no password is set.
	 */
	async getPasswordHash(): Promise<string | null> {
		const [row] = await db
			.select({ passwordHash: conventionConfig.passwordHash })
			.from(conventionConfig)
			.where(eq(conventionConfig.id, 1));

		return row?.passwordHash ?? null;
	},

	/**
	 * Set the initial password hash. Does NOT increment version.
	 */
	async setPassword(hash: string): Promise<void> {
		await db
			.update(conventionConfig)
			.set({ passwordHash: hash })
			.where(eq(conventionConfig.id, 1));
	},

	/**
	 * Change the password hash. Does NOT increment version.
	 */
	async changePassword(newHash: string): Promise<void> {
		await db
			.update(conventionConfig)
			.set({ passwordHash: newHash })
			.where(eq(conventionConfig.id, 1));
	},

	/**
	 * Remove the password by setting the hash to null. Does NOT increment version.
	 */
	async removePassword(): Promise<void> {
		await db
			.update(conventionConfig)
			.set({ passwordHash: null })
			.where(eq(conventionConfig.id, 1));
	}
};


