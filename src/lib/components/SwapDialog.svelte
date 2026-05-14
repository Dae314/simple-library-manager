<script lang="ts">
	import type { LibraryGameRecord } from '$lib/server/services/games.js';
	import type { EventMessage } from '$lib/server/ws/events.js';
	import { getWeightWarningLevel } from '$lib/utils/validation.js';
	import { formatWeight } from '$lib/utils/formatting.js';
	import { getContext } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import toast from 'svelte-hot-french-toast';
	import WeightWarning from './WeightWarning.svelte';

	const wsClient: {
		connected: boolean;
		setOnConflict: (handler: (event: EventMessage) => void) => void;
	} = getContext('ws');

	interface AvailableGame {
		id: number;
		title: string;
		bggId: number;
		copyNumber: number;
	}

	let {
		returnGame,
		open = $bindable(false),
		onSuccess
	}: {
		returnGame: LibraryGameRecord;
		open: boolean;
		onSuccess: () => void;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	// Available games state
	let availableGames: AvailableGame[] = $state([]);
	let availableTotal = $state(0);
	let searchQuery = $state('');
	let currentPage = $state(1);
	let pageSize = 10;
	let selectedGame: AvailableGame | null = $state(null);
	let loading = $state(false);

	// Weight inputs
	let checkinWeightInput = $state('');
	let checkoutWeightInput = $state('');
	let checkinWeightError = $state('');
	let checkoutWeightError = $state('');

	// Submission state
	let submitting = $state(false);
	let formError = $state('');

	// Weight warning state
	let weightWarning: { checkoutWeight: number; checkinWeight: number; tolerance: number } | null = $state(null);
	let weightUnit = $state('lbs');
	let weightTolerance = $state(0.5);

	// Conflict detection state
	let statusChangeWarning = $state(false);

	const totalPages = $derived(Math.max(1, Math.ceil(availableTotal / pageSize)));

	// Wire WebSocket conflict detection for both game IDs
	wsClient.setOnConflict((event: EventMessage) => {
		if (!open) return;

		const gameId = 'gameId' in event ? (event as any).gameId : undefined;
		if (gameId === undefined) return;

		// Check if the event affects either the return game or the selected new game
		const returnGameId = returnGame.id;
		const newGameId = selectedGame?.id;

		if (gameId === returnGameId || (newGameId !== undefined && gameId === newGameId)) {
			statusChangeWarning = true;
			invalidateAll();
		}

		// Auto-update available games list when games become available/unavailable
		if (event.type === 'game_checked_out') {
			// Remove the game from available list if it was just checked out
			availableGames = availableGames.filter((g) => g.id !== gameId);
			if (availableGames.length === 0 || availableTotal > availableGames.length) {
				fetchAvailableGames();
			}
		} else if (event.type === 'game_checked_in') {
			// A game became available — refresh the list
			fetchAvailableGames();
		}
	});

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			dialogEl.showModal();
			resetState();
			fetchAvailableGames();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	// Debounced search
	let searchTimeout: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const query = searchQuery;
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			currentPage = 1;
			fetchAvailableGames();
		}, 300);
		return () => {
			if (searchTimeout) clearTimeout(searchTimeout);
		};
	});

	function resetState() {
		searchQuery = '';
		currentPage = 1;
		selectedGame = null;
		checkinWeightInput = '';
		checkoutWeightInput = '';
		checkinWeightError = '';
		checkoutWeightError = '';
		formError = '';
		weightWarning = null;
		statusChangeWarning = false;
		availableGames = [];
		availableTotal = 0;
	}

	async function fetchAvailableGames() {
		loading = true;
		try {
			const params = new URLSearchParams({
				page: String(currentPage),
				pageSize: String(pageSize)
			});
			if (searchQuery.trim()) {
				params.set('q', searchQuery.trim());
			}
			const res = await fetch(`/api/games/available?${params}`);
			if (res.ok) {
				const data = await res.json();
				availableGames = data.games;
				availableTotal = data.total;
			} else {
				availableGames = [];
				availableTotal = 0;
			}
		} catch {
			availableGames = [];
			availableTotal = 0;
		} finally {
			loading = false;
		}
	}

	function handlePageChange(page: number) {
		currentPage = page;
		fetchAvailableGames();
	}

	function selectGame(game: AvailableGame) {
		selectedGame = game;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
		}
	}

	function handleClick(e: MouseEvent) {
		if (e.target === dialogEl) {
			open = false;
		}
	}

	function validateWeights(): boolean {
		let valid = true;
		checkinWeightError = '';
		checkoutWeightError = '';

		const checkinWeight = parseFloat(checkinWeightInput);
		if (!checkinWeightInput.trim()) {
			checkinWeightError = 'Checkin weight is required';
			valid = false;
		} else if (isNaN(checkinWeight) || !isFinite(checkinWeight) || checkinWeight <= 0) {
			checkinWeightError = 'Checkin weight must be a positive number';
			valid = false;
		}

		const checkoutWeight = parseFloat(checkoutWeightInput);
		if (!checkoutWeightInput.trim()) {
			checkoutWeightError = 'Checkout weight is required';
			valid = false;
		} else if (isNaN(checkoutWeight) || !isFinite(checkoutWeight) || checkoutWeight <= 0) {
			checkoutWeightError = 'Checkout weight must be a positive number';
			valid = false;
		}

		return valid;
	}

	function handleFormSubmit() {
		doSwap();
	}

	async function doSwap() {
		console.log('[SwapDialog] doSwap called');
		formError = '';

		if (!selectedGame) {
			formError = 'Please select a game to swap to';
			return;
		}

		if (!validateWeights()) {
			return;
		}

		submitting = true;

		try {
			const formData = new FormData();
			formData.set('returnGameId', String(returnGame.id));
			formData.set('newGameId', String(selectedGame.id));
			formData.set('checkinWeight', checkinWeightInput);
			formData.set('checkoutWeight', checkoutWeightInput);

			const response = await fetch('/library?/swap', {
				method: 'POST',
				body: formData,
				headers: { 'x-sveltekit-action': 'true' }
			});

			const text = await response.text();
			const { deserialize } = await import('$app/forms');
			const result = deserialize(text);

			if (result.type === 'success') {
				const resultData = (result as any).data;
				if (resultData?.weightWarning) {
					weightWarning = {
						checkoutWeight: resultData.weightWarning.checkoutWeight,
						checkinWeight: resultData.weightWarning.checkinWeight,
						tolerance: resultData.weightWarning.tolerance
					};
					weightUnit = resultData.weightWarning.weightUnit || 'lbs';
					weightTolerance = resultData.weightWarning.tolerance;
				}
				toast.success('Game swap completed successfully!');
				open = false;
				onSuccess();
				const { invalidateAll } = await import('$app/navigation');
				await invalidateAll();
			} else if (result.type === 'failure') {
				const resultData = (result as any).data;
				if (resultData?.conflict) {
					toast.error(resultData.message || 'A conflict occurred during the swap.');
					open = false;
				} else if (resultData?.error) {
					formError = resultData.error;
				} else if (resultData?.errors) {
					// Map field errors
					if (resultData.errors.checkinWeight) checkinWeightError = resultData.errors.checkinWeight;
					if (resultData.errors.checkoutWeight) checkoutWeightError = resultData.errors.checkoutWeight;
					if (resultData.errors.returnGameId || resultData.errors.newGameId) {
						formError = resultData.errors.returnGameId || resultData.errors.newGameId;
					}
				}
			}
		} catch {
			formError = 'An unexpected error occurred';
		} finally {
			submitting = false;
		}
	}

	function attendeeName(): string {
		const parts = [returnGame.attendeeFirstName, returnGame.attendeeLastName].filter(Boolean);
		return parts.join(' ') || 'Unknown';
	}

	function gameDisplayTitle(game: { title: string; bggId: number; copyNumber: number }): string {
		return game.copyNumber > 1 ? `${game.title} (Copy ${game.copyNumber})` : game.title;
	}

	const returnGameTitle = $derived(
		returnGame.copyNumber > 1
			? `${returnGame.title} (Copy ${returnGame.copyNumber})`
			: returnGame.title
	);

	// Live weight warning for checkin
	const liveWeightWarning = $derived.by(() => {
		if (!returnGame.checkoutWeight) return null;
		const checkinWeight = parseFloat(checkinWeightInput);
		if (!checkinWeightInput || isNaN(checkinWeight) || checkinWeight <= 0) return null;

		const level = getWeightWarningLevel(returnGame.checkoutWeight, checkinWeight, weightTolerance);
		if (level === 'none') return null;

		const difference = Math.abs(checkinWeight - returnGame.checkoutWeight);
		return {
			checkoutWeight: returnGame.checkoutWeight,
			checkinWeight,
			difference,
			tolerance: weightTolerance,
			level
		};
	});
</script>

<dialog
	bind:this={dialogEl}
	class="swap-dialog"
	aria-label="Swap {returnGameTitle}"
	onkeydown={handleKeydown}
	onclick={handleClick}
>
	<div class="dialog-content">
		<h2 class="dialog-title">Swap: {returnGameTitle}</h2>

		{#if formError}
			<div class="form-error" role="alert">{formError}</div>
		{/if}

		{#if statusChangeWarning}
			<div class="status-warning" role="alert">
				This game has been modified by another user. Please close and try again.
			</div>
		{/if}

		<!-- Return game info (read-only) -->
		<div class="return-info">
			<h3 class="section-label">Returning</h3>
			<div class="info-row">
				<span class="info-label">Attendee:</span>
				<span class="info-value">{attendeeName()}</span>
			</div>
			<div class="info-row">
				<span class="info-label">ID Type:</span>
				<span class="info-value">{returnGame.idType || 'N/A'}</span>
			</div>
			{#if returnGame.checkoutWeight != null}
				<div class="info-row">
					<span class="info-label">Checkout Weight:</span>
					<span class="info-value">{formatWeight(returnGame.checkoutWeight, weightUnit)}</span>
				</div>
			{/if}
		</div>

		<!-- Available games list -->
		<div class="available-games-section">
			<h3 class="section-label">Select New Game</h3>
			<input
				type="text"
				class="search-input"
				placeholder="Search available games..."
				bind:value={searchQuery}
				aria-label="Search available games"
			/>

			<div class="games-list" role="listbox" aria-label="Available games">
				{#if loading}
					<div class="loading-state">Loading...</div>
				{:else if availableGames.length === 0}
					<div class="empty-state">No available games found</div>
				{:else}
					{#each availableGames as game (game.id)}
						<button
							type="button"
							class="game-item"
							class:selected={selectedGame?.id === game.id}
							role="option"
							aria-selected={selectedGame?.id === game.id}
							onclick={() => selectGame(game)}
						>
							<span class="game-title">{gameDisplayTitle(game)}</span>
							<span class="game-bgg">BGG: {game.bggId}</span>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Compact pagination -->
			{#if totalPages > 1}
				<div class="compact-pagination">
					<button
						type="button"
						disabled={currentPage <= 1}
						onclick={() => handlePageChange(currentPage - 1)}
						aria-label="Previous page"
					>
						← Prev
					</button>
					<span class="page-indicator">{currentPage} / {totalPages}</span>
					<button
						type="button"
						disabled={currentPage >= totalPages}
						onclick={() => handlePageChange(currentPage + 1)}
						aria-label="Next page"
					>
						Next →
					</button>
				</div>
			{/if}
		</div>

		<!-- Weight inputs -->
		<form onsubmit={(e) => { e.preventDefault(); handleFormSubmit(); }} novalidate>

			<div class="weights-section">
				<div class="form-group">
					<label for="swap-checkinWeight">Checkin Weight ({weightUnit})</label>
					{#if returnGame.checkoutWeight != null}
						<div class="checkout-weight-reference">
							Checkout weight: <strong>{formatWeight(returnGame.checkoutWeight, weightUnit)}</strong>
						</div>
					{/if}
					<input
						id="swap-checkinWeight"
						type="number"
						step="0.1"
						min="0.1"
						required
						bind:value={checkinWeightInput}
						oninput={() => { checkinWeightError = ''; }}
						class:field-invalid={checkinWeightError}
					/>
					{#if checkinWeightError}
						<span class="field-error">{checkinWeightError}</span>
					{/if}
					{#if liveWeightWarning}
						<div class="inline-weight-warning {liveWeightWarning.level === 'red' ? 'warning-red' : 'warning-yellow'}" role="alert">
							{#if liveWeightWarning.level === 'red'}
								<strong>🚨 Weight Discrepancy — Exceeds Tolerance</strong>
							{:else}
								<strong>⚠ Minor Weight Discrepancy</strong>
							{/if}
							<span>
								Checkout: {formatWeight(liveWeightWarning.checkoutWeight, weightUnit)} ·
								Entered: {formatWeight(liveWeightWarning.checkinWeight, weightUnit)}
							</span>
							<span>
								Difference: {formatWeight(liveWeightWarning.difference, weightUnit)}
								(tolerance: {formatWeight(liveWeightWarning.tolerance, weightUnit)})
							</span>
						</div>
					{/if}
				</div>

				<div class="form-group">
					<label for="swap-checkoutWeight">Checkout Weight ({weightUnit})</label>
					<input
						id="swap-checkoutWeight"
						type="number"
						step="0.1"
						min="0.1"
						required
						bind:value={checkoutWeightInput}
						oninput={() => { checkoutWeightError = ''; }}
						class:field-invalid={checkoutWeightError}
					/>
					{#if checkoutWeightError}
						<span class="field-error">{checkoutWeightError}</span>
					{/if}
				</div>
			</div>

			<div class="dialog-actions">
				<button type="button" class="btn-cancel" onclick={() => { open = false; }}>Cancel</button>
				<button type="submit" class="btn-submit" disabled={submitting || !selectedGame || statusChangeWarning}>
					{#if submitting}
						Swapping...
					{:else}
						Confirm Swap
					{/if}
				</button>
			</div>
		</form>
	</div>
</dialog>

{#if weightWarning}
	<WeightWarning
		checkoutWeight={weightWarning.checkoutWeight}
		checkinWeight={weightWarning.checkinWeight}
		tolerance={weightWarning.tolerance}
		{weightUnit}
		onDismiss={() => { weightWarning = null; }}
	/>
{/if}

<style>
	.swap-dialog {
		border: none;
		border-radius: 8px;
		padding: 0;
		max-width: 34rem;
		width: 90vw;
		margin: auto;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
	}

	.swap-dialog::backdrop {
		background-color: rgba(0, 0, 0, 0.45);
	}

	.dialog-content {
		padding: 1.5rem;
		max-height: 85vh;
		overflow-y: auto;
	}

	.dialog-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.form-error {
		font-size: 0.85rem;
		color: #991b1b;
		background-color: #fee2e2;
		border: 1px solid #ef4444;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
		line-height: 1.4;
	}

	.status-warning {
		font-size: 0.85rem;
		color: #92400e;
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
		line-height: 1.4;
	}

	.section-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 0.4rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	/* Return info section */
	.return-info {
		background-color: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.info-row {
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
		margin-bottom: 0.2rem;
	}

	.info-label {
		color: #6b7280;
		flex-shrink: 0;
	}

	.info-value {
		color: #111827;
		font-weight: 500;
	}

	/* Available games section */
	.available-games-section {
		margin-bottom: 1rem;
	}

	.search-input {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
		margin-bottom: 0.5rem;
	}

	.search-input:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.games-list {
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		max-height: 200px;
		overflow-y: auto;
	}

	.loading-state,
	.empty-state {
		padding: 1rem;
		text-align: center;
		color: #6b7280;
		font-size: 0.85rem;
	}

	.game-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		border-bottom: 1px solid #f3f4f6;
		background: none;
		font-size: 0.85rem;
		color: #111827;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.1s;
	}

	.game-item:last-child {
		border-bottom: none;
	}

	.game-item:hover {
		background-color: #f9fafb;
	}

	.game-item.selected {
		background-color: #eef2ff;
		border-color: #c7d2fe;
	}

	.game-title {
		font-weight: 500;
	}

	.game-bgg {
		font-size: 0.8rem;
		color: #6b7280;
		flex-shrink: 0;
		margin-left: 0.5rem;
	}

	/* Compact pagination */
	.compact-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		font-size: 0.8rem;
	}

	.compact-pagination button {
		padding: 0.25rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: #fff;
		cursor: pointer;
		font-size: 0.8rem;
		color: #374151;
		transition: background-color 0.15s;
	}

	.compact-pagination button:hover:not(:disabled) {
		background-color: #f3f4f6;
	}

	.compact-pagination button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.page-indicator {
		color: #6b7280;
		font-size: 0.8rem;
	}

	/* Weights section */
	.weights-section {
		margin-bottom: 0.5rem;
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

	.checkout-weight-reference {
		font-size: 0.82rem;
		color: #4b5563;
		background-color: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		padding: 0.35rem 0.6rem;
		margin-bottom: 0.4rem;
	}

	.checkout-weight-reference strong {
		color: #111827;
	}

	.form-group input[type='number'] {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-group input[type='number']:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.field-invalid {
		border-color: #ef4444 !important;
	}

	.field-error {
		display: block;
		font-size: 0.8rem;
		color: #ef4444;
		margin-top: 0.2rem;
	}

	.inline-weight-warning {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-top: 0.4rem;
		padding: 0.5rem 0.65rem;
		border-radius: 6px;
		font-size: 0.8rem;
	}

	.inline-weight-warning strong {
		font-size: 0.82rem;
	}

	.inline-weight-warning.warning-yellow {
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		color: #92400e;
	}

	.inline-weight-warning.warning-red {
		background-color: #fee2e2;
		border: 1px solid #ef4444;
		color: #991b1b;
	}

	/* Dialog actions */
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.btn-cancel,
	.btn-submit {
		padding: 0.45rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background-color 0.15s;
	}

	.btn-cancel {
		background-color: #f3f4f6;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-cancel:hover {
		background-color: #e5e7eb;
	}

	.btn-submit {
		background-color: #6366f1;
		color: #fff;
	}

	.btn-submit:hover:not(:disabled) {
		background-color: #4f46e5;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
