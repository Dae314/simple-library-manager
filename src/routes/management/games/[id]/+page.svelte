<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { getContext } from 'svelte';
	import toast from 'svelte-hot-french-toast';
	import GameTypeBadge from '$lib/components/GameTypeBadge.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import type { EventMessage } from '$lib/server/ws/events.js';

	const wsClient: ReturnType<typeof import('$lib/stores/websocket.svelte.js').createWebSocketClient> = getContext('ws');

	type GameRecord = {
		id: number;
		title: string;
		bggId: number;
		copyNumber: number;
		totalCopies: number;
		status: string;
		prizeType: 'standard' | 'play_and_win' | 'play_and_take';
		shelfCategory: 'family' | 'small' | 'standard';
		version: number;
	};

	let { data, form }: {
		data: { game: GameRecord; transactionCount: number };
		form: {
			errors?: Record<string, string>;
			error?: string;
			values?: Record<string, string>;
			toggleError?: string;
			toggleSuccess?: boolean;
			deleteError?: string;
		} | null;
	} = $props();

	let showConflictWarning = $state(false);

	// Local form state to preserve user edits across data invalidations.
	// When non-null, the user has touched the field and their value takes priority.
	let localTitle: string | null = $state(null);
	let localBggId: string | null = $state(null);
	let localPrizeType: string | null = $state(null);
	let localShelfCategory: string | null = $state(null);

	$effect(() => {
		wsClient.setGetCurrentEditGameId(() => data.game.id);
		wsClient.setOnConflict((_event: EventMessage) => {
			showConflictWarning = true;
		});

		return () => {
			wsClient.setGetCurrentEditGameId(() => undefined);
			wsClient.setOnConflict(() => {});
		};
	});

	function handleReload() {
		showConflictWarning = false;
		localTitle = null;
		localBggId = null;
		localPrizeType = null;
		localShelfCategory = null;
		invalidateAll();
	}

	function handleDismiss() {
		showConflictWarning = false;
	}

	const statusLabel = $derived(data.game.status === 'available' ? 'Available' : 'Checked Out');
	const statusColor = $derived(data.game.status === 'available' ? 'status-available' : 'status-checked-out');
	const toggleTarget = $derived(data.game.status === 'available' ? 'checked_out' : 'available');
	const toggleLabel = $derived(data.game.status === 'available' ? 'Mark as Checked Out' : 'Mark as Available');
	const effectiveTitle = $derived(localTitle ?? form?.values?.title ?? data.game.title);
	const effectiveBggId = $derived(localBggId ?? form?.values?.bggId ?? String(data.game.bggId));
	const currentPrizeType = $derived(localPrizeType ?? form?.values?.prizeType ?? data.game.prizeType);
	const currentShelfCategory = $derived(localShelfCategory ?? form?.values?.shelfCategory ?? data.game.shelfCategory);

	// Delete dialog state
	let showDeleteDialog = $state(false);
	let confirmPassword = $state('');
	let deleteDialogEl: HTMLDialogElement | undefined = $state();
	let isPasswordSet = $derived($page.data.isPasswordSet);
	const isCheckedOut = $derived(data.game.status === 'checked_out');

	$effect(() => {
		if (!deleteDialogEl) return;
		if (showDeleteDialog && !deleteDialogEl.open) {
			deleteDialogEl.showModal();
		} else if (!showDeleteDialog && deleteDialogEl.open) {
			deleteDialogEl.close();
		}
	});

	$effect(() => {
		if (form?.deleteError) {
			toast.error(form.deleteError);
		}
	});

	function openDeleteDialog() {
		confirmPassword = '';
		showDeleteDialog = true;
	}

	function cancelDeleteDialog() {
		showDeleteDialog = false;
		confirmPassword = '';
	}

	function handleDeleteDialogKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancelDeleteDialog();
		}
	}

	function handleDeleteDialogClick(e: MouseEvent) {
		const rect = deleteDialogEl?.getBoundingClientRect();
		if (!rect) return;
		const clickedInside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (!clickedInside) {
			cancelDeleteDialog();
		}
	}

	function confirmDelete() {
		showDeleteDialog = false;
		const deleteForm = document.getElementById('delete-form') as HTMLFormElement;
		if (deleteForm) {
			const passwordInput = deleteForm.querySelector('input[name="confirmPassword"]') as HTMLInputElement;
			if (passwordInput) {
				passwordInput.value = confirmPassword;
			}
			deleteForm.requestSubmit();
		}
		confirmPassword = '';
	}
</script>

<div class="edit-game-page">
	<a href="/management/games" class="back-link" aria-label="Back to games">&larr; Games</a>
	<h1>Edit Game <ConnectionIndicator connected={wsClient.connected} /></h1>

	{#if showConflictWarning}
		<div class="conflict-warning" role="alert">
			<p class="conflict-text">This game was modified by another station. Your form data may be stale.</p>
			<div class="conflict-actions">
				<button class="btn-reload" onclick={handleReload}>Reload</button>
				<button class="btn-dismiss" onclick={handleDismiss}>Dismiss</button>
			</div>
		</div>
	{/if}

	<div class="game-header">
		<div class="game-identity">
			{#if data.game.totalCopies > 1}
				<span class="copy-number">Copy #{data.game.copyNumber}</span>
			{/if}
			<GameTypeBadge prizeType={data.game.prizeType} />
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
				value={effectiveTitle}
				oninput={(e) => { localTitle = e.currentTarget.value; }}
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
				value={effectiveBggId}
				oninput={(e) => { localBggId = e.currentTarget.value; }}
			/>
			{#if form?.errors?.bggId}
				<span class="field-error">{form.errors.bggId}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="prizeType">Prize Type</label>
			<select id="prizeType" name="prizeType" onchange={(e) => { localPrizeType = e.currentTarget.value; }}>
				<option value="standard" selected={currentPrizeType === 'standard'}>Standard</option>
				<option value="play_and_win" selected={currentPrizeType === 'play_and_win'}>Play & Win</option>
				<option value="play_and_take" selected={currentPrizeType === 'play_and_take'}>Play & Take</option>
			</select>
			{#if form?.errors?.prizeType}
				<span class="field-error">{form.errors.prizeType}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="shelfCategory">Shelf Category</label>
			<select id="shelfCategory" name="shelfCategory" onchange={(e) => { localShelfCategory = e.currentTarget.value; }}>
				<option value="standard" selected={currentShelfCategory === 'standard'}>Standard</option>
				<option value="family" selected={currentShelfCategory === 'family'}>Family</option>
				<option value="small" selected={currentShelfCategory === 'small'}>Small</option>
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

	<hr class="divider" />

	<section class="danger-section">
		<h2>Danger Zone</h2>
		{#if isCheckedOut}
			<p class="danger-description">This game must be checked in before it can be deleted.</p>
		{:else}
			<p class="danger-description">Permanently delete this game and all its transaction history. This action cannot be undone.</p>
		{/if}
		<button
			class="btn-delete"
			onclick={openDeleteDialog}
			disabled={isCheckedOut}
		>
			Delete Game
		</button>
	</section>
</div>

<!-- Delete confirmation dialog -->
<dialog
	bind:this={deleteDialogEl}
	class="confirm-dialog"
	aria-label="Delete Game"
	onkeydown={handleDeleteDialogKeydown}
	onclick={handleDeleteDialogClick}
>
	<div class="dialog-content">
		<h2 class="dialog-title">Delete Game</h2>
		<p class="dialog-message">Are you sure you want to permanently delete <strong>{data.game.title}</strong>? This action cannot be undone.</p>

		{#if data.transactionCount > 0}
			<p class="dialog-warning">This game has {data.transactionCount} transaction{data.transactionCount === 1 ? '' : 's'} that will also be permanently deleted.</p>
		{:else}
			<p class="dialog-info">This game has no associated transactions.</p>
		{/if}

		{#if isPasswordSet}
			<div class="dialog-password-field">
				<label for="delete-confirm-password">Enter your password to confirm</label>
				<input
					id="delete-confirm-password"
					type="password"
					autocomplete="current-password"
					bind:value={confirmPassword}
				/>
			</div>
		{/if}

		<div class="dialog-actions">
			<button class="btn-dialog-cancel" onclick={cancelDeleteDialog}>Cancel</button>
			<button
				class="btn-dialog-confirm"
				onclick={confirmDelete}
				disabled={isPasswordSet && !confirmPassword}
			>Delete</button>
		</div>
	</div>
</dialog>

<!-- Hidden delete form -->
<form
	id="delete-form"
	method="POST"
	action="?/delete"
	class="hidden-form"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				const data = (result as any).data;
				if (data?.deleteError) {
					toast.error(data.deleteError);
				}
			}
			await update({ reset: false });
		};
	}}
>
	<input type="hidden" name="confirmPassword" />
</form>

<style>
	.edit-game-page {
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

	.conflict-warning {
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
	}

	.conflict-text {
		font-size: 0.85rem;
		color: #92400e;
		margin-bottom: 0.5rem;
		line-height: 1.4;
	}

	.conflict-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-reload {
		padding: 0.35rem 0.75rem;
		background-color: #f59e0b;
		color: #fff;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-reload:hover {
		background-color: #d97706;
	}

	.btn-dismiss {
		padding: 0.35rem 0.75rem;
		background-color: transparent;
		color: #92400e;
		border: 1px solid #d97706;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-dismiss:hover {
		background-color: #fde68a;
	}

	/* Danger Zone section */
	.danger-section h2 {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
		color: #991b1b;
	}

	.danger-description {
		font-size: 0.85rem;
		color: #6b7280;
		margin-bottom: 0.75rem;
	}

	.btn-delete {
		padding: 0.5rem 1rem;
		background-color: #ef4444;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-delete:hover:not(:disabled) {
		background-color: #dc2626;
	}

	.btn-delete:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Hidden delete form */
	.hidden-form {
		display: none;
	}

	/* Delete confirmation dialog */
	.confirm-dialog {
		border: none;
		border-radius: 8px;
		padding: 0;
		max-width: 28rem;
		width: 90vw;
		margin: auto;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
	}

	.confirm-dialog::backdrop {
		background-color: rgba(0, 0, 0, 0.45);
	}

	.dialog-content {
		padding: 1.5rem;
	}

	.dialog-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: #111827;
	}

	.dialog-message {
		font-size: 0.9rem;
		color: #4b5563;
		margin-bottom: 0.75rem;
		line-height: 1.5;
	}

	.dialog-warning {
		font-size: 0.85rem;
		color: #92400e;
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.dialog-info {
		font-size: 0.85rem;
		color: #6b7280;
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.dialog-password-field {
		margin-bottom: 0.75rem;
	}

	.dialog-password-field label {
		display: block;
		font-size: 0.85rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.25rem;
	}

	.dialog-password-field input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.dialog-password-field input:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.btn-dialog-cancel,
	.btn-dialog-confirm {
		padding: 0.45rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background-color 0.15s;
	}

	.btn-dialog-cancel {
		background-color: #f3f4f6;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-dialog-cancel:hover {
		background-color: #e5e7eb;
	}

	.btn-dialog-confirm {
		background-color: #ef4444;
		color: #fff;
	}

	.btn-dialog-confirm:hover:not(:disabled) {
		background-color: #dc2626;
	}

	.btn-dialog-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
