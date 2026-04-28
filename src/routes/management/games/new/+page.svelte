<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';

	let { form }: {
		form: {
			errors?: Record<string, string>;
			values?: Record<string, string>;
		} | null;
	} = $props();

	$effect(() => {
		if (form?.errors && Object.keys(form.errors).length > 0) {
			toast.error('Please fix the errors below.');
		}
	});
</script>

<div class="add-game-page">
	<h1>Add Game</h1>

	<form method="POST" use:enhance>
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
			<label for="gameType">Game Type</label>
			<select id="gameType" name="gameType">
				<option value="standard" selected={(!form?.values?.gameType) || form?.values?.gameType === 'standard'}>Standard</option>
				<option value="play_and_win" selected={form?.values?.gameType === 'play_and_win'}>Play & Win</option>
				<option value="play_and_take" selected={form?.values?.gameType === 'play_and_take'}>Play & Take</option>
			</select>
			{#if form?.errors?.gameType}
				<span class="field-error">{form.errors.gameType}</span>
			{/if}
		</div>

		<div class="form-actions">
			<a href="/management" class="btn-cancel">Cancel</a>
			<button type="submit" class="btn-submit">Add Game</button>
		</div>
	</form>
</div>

<style>
	.add-game-page {
		max-width: 480px;
		margin: 0 auto;
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
