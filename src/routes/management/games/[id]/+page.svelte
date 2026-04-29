<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import toast from 'svelte-hot-french-toast';
	import GameTypeBadge from '$lib/components/GameTypeBadge.svelte';

	type GameRecord = {
		id: number;
		title: string;
		bggId: number;
		copyNumber: number;
		status: string;
		gameType: 'standard' | 'play_and_win' | 'play_and_take';
		version: number;
	};

	let { data, form }: {
		data: { game: GameRecord };
		form: {
			errors?: Record<string, string>;
			error?: string;
			values?: Record<string, string>;
			toggleError?: string;
			toggleSuccess?: boolean;
		} | null;
	} = $props();

	const statusLabel = $derived(data.game.status === 'available' ? 'Available' : 'Checked Out');
	const statusColor = $derived(data.game.status === 'available' ? 'status-available' : 'status-checked-out');
	const toggleTarget = $derived(data.game.status === 'available' ? 'checked_out' : 'available');
	const toggleLabel = $derived(data.game.status === 'available' ? 'Mark as Checked Out' : 'Mark as Available');
	const currentGameType = $derived(form?.values?.gameType ?? data.game.gameType);
</script>

<div class="edit-game-page">
	<h1>Edit Game</h1>

	<div class="game-header">
		<div class="game-identity">
			<span class="copy-number">Copy #{data.game.copyNumber}</span>
			<GameTypeBadge gameType={data.game.gameType} />
			<span class="status-badge {statusColor}">{statusLabel}</span>
		</div>
		<a
			href="https://boardgamegeek.com/boardgame/{data.game.bggId}"
			target="_blank"
			rel="noopener noreferrer"
			class="bgg-link"
		>
			View on BGG
		</a>
	</div>

	<form method="POST" action="?/update" use:enhance={() => {
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
				value={form?.values?.title ?? data.game.title}
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
				value={form?.values?.bggId ?? data.game.bggId}
			/>
			{#if form?.errors?.bggId}
				<span class="field-error">{form.errors.bggId}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="gameType">Game Type</label>
			<select id="gameType" name="gameType">
				<option value="standard" selected={currentGameType === 'standard'}>Standard</option>
				<option value="play_and_win" selected={currentGameType === 'play_and_win'}>Play & Win</option>
				<option value="play_and_take" selected={currentGameType === 'play_and_take'}>Play & Take</option>
			</select>
			{#if form?.errors?.gameType}
				<span class="field-error">{form.errors.gameType}</span>
			{/if}
		</div>

		{#if form?.error}
			<div class="form-error" role="alert">{form.error}</div>
		{/if}

		<div class="form-actions">
			<a href="/management/games" class="btn-cancel">Cancel</a>
			<button type="submit" class="btn-submit">Save Changes</button>
		</div>
	</form>

	<hr class="divider" />

	<section class="status-section">
		<h2>Status Override</h2>
		<p class="status-description">
			Toggle the game status manually. This creates a corrective transaction in the log.
		</p>
		<form
			method="POST"
			action="?/toggleStatus"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						toast.success('Game status updated successfully!');
					} else if (result.type === 'failure') {
						const data = (result as any).data;
						if (data?.toggleError) {
							toast.error(data.toggleError);
						}
					}
					await update({ reset: false });
					await invalidateAll();
				};
			}}
		>
			<input type="hidden" name="newStatus" value={toggleTarget} />
			<input type="hidden" name="version" value={data.game.version} />
			<button type="submit" class="btn-toggle {statusColor}">
				{toggleLabel}
			</button>
		</form>
	</section>
</div>

<style>
	.edit-game-page {
		max-width: 480px;
		margin: 0 auto;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.game-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
	}

	.game-identity {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.copy-number {
		font-size: 0.85rem;
		font-weight: 600;
		color: #6b7280;
	}

	.status-badge {
		display: inline-block;
		padding: 0.15em 0.5em;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
	}

	.status-available {
		background-color: #d1fae5;
		color: #065f46;
	}

	.status-checked-out {
		background-color: #fee2e2;
		color: #991b1b;
	}

	.bgg-link {
		font-size: 0.8rem;
		color: #6366f1;
		text-decoration: none;
	}

	.bgg-link:hover {
		text-decoration: underline;
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

	.divider {
		border: none;
		border-top: 1px solid #e5e7eb;
		margin: 1.5rem 0;
	}

	.status-section h2 {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
		color: #111827;
	}

	.status-description {
		font-size: 0.85rem;
		color: #6b7280;
		margin-bottom: 0.75rem;
	}

	.btn-toggle {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-toggle.status-available {
		background-color: #fca5a5;
		color: #7f1d1d;
	}

	.btn-toggle.status-available:hover {
		background-color: #f87171;
	}

	.btn-toggle.status-checked-out {
		background-color: #6ee7b7;
		color: #064e3b;
	}

	.btn-toggle.status-checked-out:hover {
		background-color: #34d399;
	}
</style>
