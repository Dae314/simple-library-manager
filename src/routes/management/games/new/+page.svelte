<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import toast from 'svelte-hot-french-toast';

	let { form }: {
		form: {
			errors?: Record<string, string>;
			error?: string;
			values?: Record<string, string>;
		} | null;
	} = $props();
</script>

<div class="add-game-page">
	<a href="/management/games" class="back-link" aria-label="Back to games">&larr; Games</a>
	<h1>Add Game</h1>

	<form method="POST" use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'failure') {
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
			<label for="title">Title</label>
			<input
				id="title"
				name="title"
				type="text"
				required
				value={form?.values?.title ?? ''}
			/>
			{#if form?.errors?.title}
				<span class="field-error">{form.errors.title}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="bggId">BGG ID</label>
			<input
				id="bggId"
				name="bggId"
				type="number"
				min="1"
				step="1"
				required
				value={form?.values?.bggId ?? ''}
			/>
			{#if form?.errors?.bggId}
				<span class="field-error">{form.errors.bggId}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="prizeType">Prize Type</label>
			<select id="prizeType" name="prizeType">
				<option value="standard" selected={(!form?.values?.prizeType) || form?.values?.prizeType === 'standard'}>Standard</option>
				<option value="play_and_win" selected={form?.values?.prizeType === 'play_and_win'}>Play & Win</option>
				<option value="play_and_take" selected={form?.values?.prizeType === 'play_and_take'}>Play & Take</option>
			</select>
			{#if form?.errors?.prizeType}
				<span class="field-error">{form.errors.prizeType}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="shelfCategory">Shelf Category</label>
			<select id="shelfCategory" name="shelfCategory">
				<option value="standard" selected={(!form?.values?.shelfCategory) || form?.values?.shelfCategory === 'standard'}>Standard</option>
				<option value="family" selected={form?.values?.shelfCategory === 'family'}>Family</option>
				<option value="small" selected={form?.values?.shelfCategory === 'small'}>Small</option>
			</select>
			{#if form?.errors?.shelfCategory}
				<span class="field-error">{form.errors.shelfCategory}</span>
			{/if}
		</div>

		{#if form?.error}
			<div class="form-error" role="alert">{form.error}</div>
		{/if}

		<div class="form-actions">
			<a href="/management/games" class="btn-cancel">Cancel</a>
			<button type="submit" class="btn-submit">Add Game</button>
		</div>
	</form>
</div>

<style>
	.add-game-page {
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
		margin-bottom: 1.25rem;
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
