<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import toast from 'svelte-hot-french-toast';

	type AttendeeRecord = {
		id: number;
		firstName: string;
		lastName: string;
		idType: string;
		createdAt: Date;
		updatedAt: Date;
	};

	let { data, form }: {
		data: { attendee: AttendeeRecord; idTypes: string[] };
		form: {
			errors?: Record<string, string>;
			error?: string;
			values?: Record<string, string>;
		} | null;
	} = $props();

	// Local form state to preserve user edits across data invalidations
	let localFirstName: string | null = $state(null);
	let localLastName: string | null = $state(null);
	let localIdType: string | null = $state(null);

	const effectiveFirstName = $derived(localFirstName ?? form?.values?.firstName ?? data.attendee.firstName);
	const effectiveLastName = $derived(localLastName ?? form?.values?.lastName ?? data.attendee.lastName);
	const effectiveIdType = $derived(localIdType ?? form?.values?.idType ?? data.attendee.idType);
</script>

<div class="edit-attendee-page">
	<a href="/management/attendees" class="back-link" aria-label="Back to attendees">&larr; Attendees</a>
	<h1>Edit Attendee</h1>

	<form method="POST" action="?/update" use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success' || result.type === 'redirect') {
				toast.success('Attendee updated successfully!');
			} else if (result.type === 'failure') {
				const data = (result as any).data;
				if (data?.error) {
					toast.error(data.error);
				} else if (data?.errors) {
					toast.error('Please fix the errors below.');
				}
			}
			await update({ reset: false });
		};
	}} novalidate>
		<div class="form-group">
			<label for="firstName">First Name</label>
			<input
				id="firstName"
				name="firstName"
				type="text"
				required
				maxlength="100"
				value={effectiveFirstName}
				oninput={(e) => { localFirstName = e.currentTarget.value; }}
			/>
			{#if form?.errors?.firstName}
				<span class="field-error">{form.errors.firstName}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="lastName">Last Name</label>
			<input
				id="lastName"
				name="lastName"
				type="text"
				required
				maxlength="100"
				value={effectiveLastName}
				oninput={(e) => { localLastName = e.currentTarget.value; }}
			/>
			{#if form?.errors?.lastName}
				<span class="field-error">{form.errors.lastName}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="idType">ID Type</label>
			<select id="idType" name="idType" onchange={(e) => { localIdType = e.currentTarget.value; }}>
				{#each data.idTypes as type}
					<option value={type} selected={effectiveIdType === type}>{type}</option>
				{/each}
			</select>
			{#if form?.errors?.idType}
				<span class="field-error">{form.errors.idType}</span>
			{/if}
		</div>

		{#if form?.error}
			<div class="form-error" role="alert">{form.error}</div>
		{/if}

		<div class="form-actions">
			<a href="/management/attendees" class="btn-cancel">Cancel</a>
			<button type="submit" class="btn-submit">Save Changes</button>
		</div>
	</form>
</div>

<style>
	.edit-attendee-page {
		max-width: 480px;
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
		margin-bottom: 1rem;
		color: #111827;
	}

	.form-group {
		margin-bottom: 0.85rem;
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

	.field-error {
		display: block;
		font-size: 0.8rem;
		color: #ef4444;
		margin-top: 0.2rem;
	}

	.form-error {
		padding: 0.6rem 0.8rem;
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		color: #dc2626;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
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
</style>
