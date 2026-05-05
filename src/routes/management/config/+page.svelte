<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import toast from 'svelte-hot-french-toast';
	import { isEndDateValid } from '$lib/utils/validation.js';

	type ConventionConfig = {
		id: number;
		conventionName: string;
		startDate: string | null;
		endDate: string | null;
		weightTolerance: number;
		weightUnit: string;
		version: number;
	};

	type IdType = {
		id: number;
		name: string;
	};

	let { data, form }: {
		data: { config: ConventionConfig; idTypes: IdType[] };
		form: Record<string, any> | null;
	} = $props();

	let newIdType = $state('');
	let startDateInput = $state('');
	let endDateInput = $state('');

	$effect(() => {
		startDateInput = form?.configValues?.startDate ?? data.config.startDate ?? '';
		endDateInput = form?.configValues?.endDate ?? data.config.endDate ?? '';
	});

	const isPasswordSet = $derived(($page.data as Record<string, unknown>).isPasswordSet as boolean);

	const endDateError = $derived(
		!isEndDateValid(startDateInput, endDateInput)
			? 'End date must be on or after the start date'
			: ''
	);

	const configValues = $derived({
		conventionName: form?.configValues?.conventionName ?? data.config.conventionName,
		startDate: startDateInput,
		endDate: endDateInput,
		weightTolerance: form?.configValues?.weightTolerance ?? String(data.config.weightTolerance),
		weightUnit: form?.configValues?.weightUnit ?? data.config.weightUnit
	});
</script>

<div class="config-page">
	<a href="/management" class="back-link" aria-label="Back to management">&larr; Management</a>
	<h1>Convention Configuration</h1>

	<section class="config-section">
		<h2>General Settings</h2>
		<form method="POST" action="?/updateConfig" use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') {
					toast.success('Configuration saved.');
				} else if (result.type === 'failure') {
					const data = (result as any).data;
					if (data?.configError) {
						toast.error(data.configError);
					} else {
						toast.error('Please fix the errors below.');
					}
				}
				await update({ reset: false });
			};
		}} novalidate>
			<input type="hidden" name="version" value={data.config.version} />

			<div class="form-group">
				<label for="conventionName">Convention Name</label>
				<input
					id="conventionName"
					name="conventionName"
					type="text"
					value={configValues.conventionName}
					placeholder="e.g. GenCon 2026"
				/>
				{#if form?.configErrors?.conventionName}
					<span class="field-error">{form.configErrors.conventionName}</span>
				{/if}
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="startDate">Start Date</label>
					<input
						id="startDate"
						name="startDate"
						type="date"
						bind:value={startDateInput}
					/>
				</div>
				<div class="form-group">
					<label for="endDate">End Date</label>
					<input
						id="endDate"
						name="endDate"
						type="date"
						bind:value={endDateInput}
						aria-invalid={endDateError ? 'true' : undefined}
						aria-describedby={endDateError ? 'endDate-error' : undefined}
					/>
					{#if endDateError}
						<span id="endDate-error" class="field-error">{endDateError}</span>
					{:else if form?.configErrors?.endDate}
						<span id="endDate-error" class="field-error">{form.configErrors.endDate}</span>
					{/if}
				</div>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="weightTolerance">Weight Tolerance</label>
					<input
						id="weightTolerance"
						name="weightTolerance"
						type="number"
						step="any"
						value={configValues.weightTolerance}
					/>
					{#if form?.configErrors?.weightTolerance}
						<span class="field-error">{form.configErrors.weightTolerance}</span>
					{/if}
				</div>
				<div class="form-group">
					<label for="weightUnit">Weight Unit</label>
					<select id="weightUnit" name="weightUnit">
						<option value="oz" selected={configValues.weightUnit === 'oz'}>Ounces (oz)</option>
						<option value="kg" selected={configValues.weightUnit === 'kg'}>Kilograms (kg)</option>
						<option value="g" selected={configValues.weightUnit === 'g'}>Grams (g)</option>
					</select>
				</div>
			</div>

			<div class="form-actions">
				<button type="submit" class="btn-submit">Save Configuration</button>
			</div>
		</form>
	</section>

	<section class="config-section">
		<h2>ID Types</h2>
		<p class="section-description">Manage the identification types available during checkout (e.g. Driver's License, Student ID).</p>

		{#if data.idTypes.length > 0}
			<ul class="id-type-list" role="list">
				{#each data.idTypes as idType (idType.id)}
					<li class="id-type-item">
						<span class="id-type-name">{idType.name}</span>
						<form method="POST" action="?/removeIdType" use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								toast.success('ID type removed.');
							} else if (result.type === 'failure') {
								const data = (result as any).data;
								toast.error(data?.removeError || 'Failed to remove ID type');
							}
							await update({ reset: false });
						};
					}}>
							<input type="hidden" name="id" value={idType.id} />
							<button type="submit" class="btn-remove" aria-label="Remove {idType.name}">✕</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty-message">No ID types configured. Add one below.</p>
		{/if}

		<form method="POST" action="?/addIdType" class="add-id-form" use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') {
					toast.success('ID type added.');
					newIdType = '';
				} else if (result.type === 'failure') {
					const data = (result as any).data;
					if (data?.idTypeErrors) {
						toast.error(Object.values(data.idTypeErrors)[0] as string);
					}
				}
				await update({ reset: false });
			};
		}}>
			<input
				name="name"
				type="text"
				placeholder="New ID type name..."
				bind:value={newIdType}
				aria-label="New ID type name"
			/>
			<button type="submit" class="btn-add" disabled={!newIdType.trim()}>Add</button>
		</form>
	</section>

	<section class="config-section">
		<h2>Password Protection</h2>
		<p class="section-description">Protect management pages with a password. When set, all management routes require authentication.</p>

		{#if !isPasswordSet}
			<form method="POST" action="?/setPassword" use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						toast.success('Password set. Management pages are now protected.');
					} else if (result.type === 'failure') {
						const data = (result as any).data;
						if (data?.passwordError) {
							toast.error(data.passwordError);
						} else if (data?.passwordErrors) {
							toast.error('Please fix the errors below.');
						}
					}
					await update({ reset: true });
				};
			}} novalidate>
				<div class="form-group">
					<label for="setPassword">Password</label>
					<input
						id="setPassword"
						name="password"
						type="password"
						autocomplete="new-password"
					/>
					{#if form?.passwordErrors?.password}
						<span class="field-error">{form.passwordErrors.password}</span>
					{/if}
				</div>

				<div class="form-group">
					<label for="setPasswordConfirmation">Confirm Password</label>
					<input
						id="setPasswordConfirmation"
						name="confirmation"
						type="password"
						autocomplete="new-password"
					/>
					{#if form?.passwordErrors?.confirmation}
						<span class="field-error">{form.passwordErrors.confirmation}</span>
					{/if}
				</div>

				<div class="form-actions">
					<button type="submit" class="btn-submit">Set Password</button>
				</div>
			</form>
		{:else}
			<div class="password-status">
				<span class="status-badge status-active">Password active</span>
			</div>

			<details class="password-form-group">
				<summary>Change Password</summary>
				<form method="POST" action="?/changePassword" use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							toast.success('Password changed successfully.');
						} else if (result.type === 'failure') {
							const data = (result as any).data;
							if (data?.passwordError) {
								toast.error(data.passwordError);
							} else if (data?.changePasswordErrors) {
								toast.error('Please fix the errors below.');
							}
						}
						await update({ reset: true });
					};
				}} novalidate>
					<div class="form-group">
						<label for="changeCurrentPassword">Current Password</label>
						<input
							id="changeCurrentPassword"
							name="currentPassword"
							type="password"
							autocomplete="current-password"
						/>
						{#if form?.changePasswordErrors?.currentPassword}
							<span class="field-error">{form.changePasswordErrors.currentPassword}</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="changeNewPassword">New Password</label>
						<input
							id="changeNewPassword"
							name="newPassword"
							type="password"
							autocomplete="new-password"
						/>
						{#if form?.changePasswordErrors?.newPassword}
							<span class="field-error">{form.changePasswordErrors.newPassword}</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="changeNewPasswordConfirmation">Confirm New Password</label>
						<input
							id="changeNewPasswordConfirmation"
							name="newPasswordConfirmation"
							type="password"
							autocomplete="new-password"
						/>
						{#if form?.changePasswordErrors?.newPasswordConfirmation}
							<span class="field-error">{form.changePasswordErrors.newPasswordConfirmation}</span>
						{/if}
					</div>

					<div class="form-actions">
						<button type="submit" class="btn-submit">Change Password</button>
					</div>
				</form>
			</details>

			<details class="password-form-group">
				<summary>Remove Password</summary>
				<form method="POST" action="?/removePassword" use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							toast.success('Password removed. Management pages are now open.');
						} else if (result.type === 'failure') {
							const data = (result as any).data;
							if (data?.passwordError) {
								toast.error(data.passwordError);
							} else if (data?.removePasswordErrors) {
								toast.error('Please fix the errors below.');
							}
						}
						await update({ reset: true });
					};
				}} novalidate>
					<p class="warning-text">This will remove password protection from all management pages.</p>

					<div class="form-group">
						<label for="removeCurrentPassword">Current Password</label>
						<input
							id="removeCurrentPassword"
							name="currentPassword"
							type="password"
							autocomplete="current-password"
						/>
						{#if form?.removePasswordErrors?.currentPassword}
							<span class="field-error">{form.removePasswordErrors.currentPassword}</span>
						{/if}
					</div>

					<div class="form-actions">
						<button type="submit" class="btn-danger">Remove Password</button>
					</div>
				</form>
			</details>
		{/if}
	</section>
</div>

<style>
	.config-page {
		max-width: 560px;
		margin: 0 auto;
	}

	.back-link {
		display: inline-block;
		font-size: 0.85rem;
		color: #6366f1;
		text-decoration: none;
		margin-bottom: 0.5rem;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
		color: #111827;
	}

	h2 {
		font-size: 1.1rem;
		font-weight: 600;
		color: #1f2937;
		margin-bottom: 0.75rem;
	}

	.config-section {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.section-description {
		font-size: 0.85rem;
		color: #6b7280;
		margin-bottom: 0.75rem;
	}

	.form-group {
		margin-bottom: 0.85rem;
		flex: 1;
	}

	.form-group label {
		display: block;
		font-size: 0.85rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.25rem;
	}

	.form-group input,
	.form-group select {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-group input:focus,
	.form-group select:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.form-row {
		display: flex;
		gap: 0.75rem;
	}

	.field-error {
		display: block;
		font-size: 0.8rem;
		color: #ef4444;
		margin-top: 0.2rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}

	.btn-submit {
		flex: 1;
		padding: 0.5rem;
		background-color: #6366f1;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-submit:hover {
		background-color: #4f46e5;
	}

	.id-type-list {
		list-style: none;
		margin-bottom: 0.75rem;
	}

	.id-type-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.id-type-item:last-child {
		border-bottom: none;
	}

	.id-type-name {
		font-size: 0.9rem;
		color: #1f2937;
	}

	.btn-remove {
		background: none;
		border: none;
		color: #9ca3af;
		font-size: 1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		transition: color 0.15s, background-color 0.15s;
	}

	.btn-remove:hover {
		color: #ef4444;
		background-color: #fef2f2;
	}

	.add-id-form {
		display: flex;
		gap: 0.5rem;
	}

	.add-id-form input {
		flex: 1;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.add-id-form input:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.btn-add {
		padding: 0.45rem 0.9rem;
		background-color: #10b981;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-add:hover:not(:disabled) {
		background-color: #059669;
	}

	.btn-add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-message {
		color: #6b7280;
		font-size: 0.85rem;
		padding: 0.5rem 0;
	}

	@media (max-width: 480px) {
		.form-row {
			flex-direction: column;
			gap: 0;
		}
	}

	.password-status {
		margin-bottom: 0.75rem;
	}

	.status-badge {
		display: inline-block;
		font-size: 0.8rem;
		font-weight: 500;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
	}

	.status-active {
		background-color: #dcfce7;
		color: #166534;
	}

	.password-form-group {
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		margin-bottom: 0.75rem;
	}

	.password-form-group summary {
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		user-select: none;
	}

	.password-form-group summary:hover {
		color: #6366f1;
	}

	.password-form-group[open] summary {
		border-bottom: 1px solid #e5e7eb;
		margin-bottom: 0.75rem;
	}

	.password-form-group form {
		padding: 0 0.75rem 0.75rem;
	}

	.warning-text {
		font-size: 0.85rem;
		color: #b45309;
		background-color: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
	}

	.btn-danger {
		flex: 1;
		padding: 0.5rem;
		background-color: #ef4444;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-danger:hover {
		background-color: #dc2626;
	}
</style>
