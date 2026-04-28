<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';

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

	$effect(() => {
		if (form?.success) {
			toast.success('Configuration saved.');
		}
		if (form?.idTypeAdded) {
			toast.success('ID type added.');
			newIdType = '';
		}
		if (form?.idTypeRemoved) {
			toast.success('ID type removed.');
		}
		if (form?.configErrors) {
			toast.error('Please fix the errors below.');
		}
		if (form?.idTypeErrors) {
			toast.error(Object.values(form.idTypeErrors)[0] as string);
		}
	});

	const configValues = $derived({
		conventionName: form?.configValues?.conventionName ?? data.config.conventionName,
		startDate: form?.configValues?.startDate ?? data.config.startDate ?? '',
		endDate: form?.configValues?.endDate ?? data.config.endDate ?? '',
		weightTolerance: form?.configValues?.weightTolerance ?? String(data.config.weightTolerance),
		weightUnit: form?.configValues?.weightUnit ?? data.config.weightUnit
	});
</script>

<div class="config-page">
	<h1>Convention Configuration</h1>

	<section class="config-section">
		<h2>General Settings</h2>
		<form method="POST" action="?/updateConfig" use:enhance>
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
						value={configValues.startDate}
					/>
				</div>
				<div class="form-group">
					<label for="endDate">End Date</label>
					<input
						id="endDate"
						name="endDate"
						type="date"
						value={configValues.endDate}
					/>
					{#if form?.configErrors?.endDate}
						<span class="field-error">{form.configErrors.endDate}</span>
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
						min="0.01"
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
				<a href="/management" class="btn-cancel">Back</a>
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
						<form method="POST" action="?/removeIdType" use:enhance>
							<input type="hidden" name="id" value={idType.id} />
							<button type="submit" class="btn-remove" aria-label="Remove {idType.name}">✕</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty-message">No ID types configured. Add one below.</p>
		{/if}

		<form method="POST" action="?/addIdType" class="add-id-form" use:enhance>
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
</div>

<style>
	.config-page {
		max-width: 560px;
		margin: 0 auto;
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

	.btn-cancel {
		flex: 1;
		padding: 0.5rem;
		background-color: #f3f4f6;
		color: #374151;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		text-align: center;
		text-decoration: none;
		transition: background-color 0.15s;
	}

	.btn-cancel:hover {
		background-color: #e5e7eb;
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
</style>
