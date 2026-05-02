<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { getContext, untrack } from 'svelte';
	import toast from 'svelte-hot-french-toast';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import GameTypeBadge from '$lib/components/GameTypeBadge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import { formatDuration, formatWeight } from '$lib/utils/formatting';

	const wsClient: { connected: boolean } = getContext('ws');

	type CheckedOutGame = {
		id: number;
		title: string;
		bggId: number;
		copyNumber: number;
		totalCopies: number;
		status: string;
		gameType: 'standard' | 'play_and_win' | 'play_and_take';
		version: number;
		attendeeFirstName?: string | null;
		attendeeLastName?: string | null;
		idType?: string | null;
		checkoutWeight?: number | null;
		checkoutAt?: Date | null;
	};

	type PaginatedResult = {
		items: CheckedOutGame[];
		total: number;
		page: number;
		pageSize: number;
	};

	let { data, form }: {
		data: {
			games: PaginatedResult;
			weightUnit: string;
			weightTolerance: number;
			sortField: string;
			sortDir: string;
		};
		form: {
			errors?: Record<string, string>;
			values?: Record<string, unknown>;
			gameId?: number;
			success?: boolean;
			conflict?: boolean;
			message?: string;
		} | null;
	} = $props();

	let selectedGame: CheckedOutGame | null = $state(null);
	let checkinWeightInput: string = $state('');
	let showPlayAndTakeDialog = $state(false);
	let pendingFormElement: HTMLFormElement | null = $state(null);

	$effect(() => {
		const items = data.games.items;
		const current = untrack(() => selectedGame);
		if (current) {
			const fresh = items.find((g) => g.id === current.id);
			if (fresh) {
				selectedGame = fresh;
			}
		}
	});

	const columns = [
		{ key: 'title', label: 'Title', sortField: 'title' },
		{ key: 'type', label: 'Type', sortField: 'game_type' },
		{ key: 'attendee', label: 'Attendee', sortField: 'attendee' },
		{ key: 'checkoutTime', label: 'Checked Out', sortField: 'checkout_time' },
		{ key: 'weight', label: 'Weight' },
		{ key: 'actions', label: 'Actions', srOnly: true }
	];

	const filters = [
		{ key: 'search', label: 'Search', type: 'text' as const, placeholder: 'Search by game title or attendee name...' }
	];

	let filterValues = $derived({
		search: new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost').searchParams.get('search') || ''
	});

	function updateUrl(params: Record<string, string>) {
		const url = new URL(window.location.href);
		for (const [key, value] of Object.entries(params)) {
			if (value) {
				url.searchParams.set(key, value);
			} else {
				url.searchParams.delete(key);
			}
		}
		url.searchParams.delete('page');
		goto(url.toString(), { replaceState: true, keepFocus: true });
	}

	function handleFilterChange(values: Record<string, any>) {
		updateUrl({ search: values.search ?? '' });
	}

	function handleSort(field: string, direction: 'asc' | 'desc') {
		updateUrl({ sortField: field, sortDir: direction });
	}

	function handlePageChange(page: number) {
		const url = new URL(window.location.href);
		url.searchParams.set('page', String(page));
		goto(url.toString(), { replaceState: true });
	}

	function handlePageSizeChange(size: number) {
		const url = new URL(window.location.href);
		url.searchParams.set('pageSize', String(size));
		url.searchParams.set('page', '1');
		goto(url.toString(), { replaceState: true });
	}

	function selectGame(game: CheckedOutGame) {
		selectedGame = game;
		checkinWeightInput = '';
	}

	function cancelSelection() {
		selectedGame = null;
	}

	function gameDisplayTitle(game: CheckedOutGame): string {
		return game.totalCopies > 1 ? `${game.title} (Copy #${game.copyNumber})` : game.title;
	}

	function getCheckoutDuration(game: CheckedOutGame): string {
		if (!game.checkoutAt) return '—';
		const checkoutDate = typeof game.checkoutAt === 'string' ? new Date(game.checkoutAt) : game.checkoutAt;
		const ms = Date.now() - checkoutDate.getTime();
		return formatDuration(ms);
	}

	function attendeeName(game: CheckedOutGame): string {
		const parts = [game.attendeeFirstName, game.attendeeLastName].filter(Boolean);
		return parts.join(' ') || 'Unknown';
	}

	function confirmPlayAndTake(takes: boolean) {
		showPlayAndTakeDialog = false;
		if (pendingFormElement) {
			const hiddenInput = pendingFormElement.querySelector('input[name="attendeeTakesGame"]') as HTMLInputElement;
			if (hiddenInput) {
				hiddenInput.value = takes ? 'true' : 'false';
			}
			const formData = new FormData(pendingFormElement);
			const action = pendingFormElement.action;
			pendingFormElement = null;

			fetch(action, {
				method: 'POST',
				body: formData,
				headers: { 'x-sveltekit-action': 'true' }
			}).then(async (response) => {
				const result = deserialize(await response.text());
				if (result.type === 'success') {
					toast.success('Game checked in successfully!');
					selectedGame = null;
					checkinWeightInput = '';
				}
				await applyAction(result);
				await invalidateAll();
			});
		}
	}

	const selectedGameTitle = $derived(selectedGame ? gameDisplayTitle(selectedGame) : '');

	const liveWeightWarning = $derived.by(() => {
		if (!selectedGame?.checkoutWeight) return null;
		const checkinWeight = parseFloat(checkinWeightInput);
		if (!checkinWeightInput || isNaN(checkinWeight) || checkinWeight <= 0) return null;
		const difference = Math.abs(checkinWeight - selectedGame.checkoutWeight);
		if (difference > data.weightTolerance) {
			return {
				checkoutWeight: selectedGame.checkoutWeight,
				checkinWeight,
				difference,
				tolerance: data.weightTolerance
			};
		}
		return null;
	});
</script>

<h1>Check In <ConnectionIndicator connected={wsClient.connected} /></h1>

<div class="checkin-layout">
	<section class="game-list-section">
		<SortableTable
			{columns}
			items={data.games.items}
			totalItems={data.games.total}
			currentPage={data.games.page}
			pageSize={data.games.pageSize}
			sortField={data.sortField}
			sortDirection={data.sortDir}
			{filters}
			{filterValues}
			emptyMessage="No checked-out games found."
			onSort={handleSort}
			onFilterChange={handleFilterChange}
			onPageChange={handlePageChange}
			onPageSizeChange={handlePageSizeChange}
		>
			{#snippet row(game)}
				<tr class:selected-row={selectedGame?.id === game.id}>
					<td>
						<span class="game-title">{gameDisplayTitle(game)}</span>
					</td>
					<td><GameTypeBadge gameType={game.gameType} /></td>
					<td>{attendeeName(game)}</td>
					<td>
						<span class="duration">{getCheckoutDuration(game)}</span>
					</td>
					<td>
						{#if game.checkoutWeight != null}
							{formatWeight(game.checkoutWeight, data.weightUnit)}
						{:else}
							—
						{/if}
					</td>
					<td>
						<button
							class="btn-checkin"
							onclick={() => selectGame(game)}
							disabled={selectedGame?.id === game.id}
						>
							Check In
						</button>
					</td>
				</tr>
			{/snippet}
		</SortableTable>
	</section>

	{#if selectedGame}
		<section class="checkin-form-section" aria-label="Check in form">
			<h2>Checking in: {selectedGameTitle}</h2>

			<div class="id-reminder" role="alert">
				<strong>Reminder:</strong> Return {attendeeName(selectedGame)}'s {selectedGame.idType || 'ID'}
			</div>

			{#if selectedGame.gameType === 'play_and_win'}
				<div class="raffle-reminder" role="alert">
					<strong>Play & Win:</strong> Remember to collect raffle entries from {attendeeName(selectedGame)}
				</div>
			{/if}

			<form method="POST" action="?/checkin" use:enhance={({ formElement, formData, cancel }) => {
				if (selectedGame?.gameType === 'play_and_take') {
					cancel();
					pendingFormElement = formElement;
					showPlayAndTakeDialog = true;
					return;
				}
				return async ({ result, update }) => {
					if (result.type === 'success') {
						toast.success('Game checked in successfully!');
						selectedGame = null;
						checkinWeightInput = '';
					} else if (result.type === 'failure') {
						const data = (result as any).data;
						if (data?.conflict) {
							toast.error(data.message || 'This game is no longer checked out.');
						} else if (data?.error) {
							toast.error(data.error);
						}
					}
					await update({ reset: false });
				};
			}} novalidate>
				<input type="hidden" name="gameId" value={selectedGame.id} />
				<input type="hidden" name="attendeeTakesGame" value="false" />

				<div class="form-group">
					<label for="checkinWeight">Weight ({data.weightUnit})</label>
					{#if selectedGame.checkoutWeight != null}
						<div class="checkout-weight-reference">
							Checkout weight: <strong>{formatWeight(selectedGame.checkoutWeight, data.weightUnit)}</strong>
						</div>
					{/if}
					<input
						id="checkinWeight"
						name="checkinWeight"
						type="number"
						step="0.1"
						min="0.1"
						required
						value={form?.values?.checkinWeight ?? ''}
						oninput={(e) => { checkinWeightInput = (e.target as HTMLInputElement).value; }}
					/>
					{#if form?.errors?.checkinWeight}
						<span class="field-error">{form.errors.checkinWeight}</span>
					{/if}
					{#if liveWeightWarning}
						<div class="inline-weight-warning" role="alert">
							<strong>⚠ Weight Discrepancy</strong>
							<span>
								Checkout: {formatWeight(liveWeightWarning.checkoutWeight, data.weightUnit)} ·
								Entered: {formatWeight(liveWeightWarning.checkinWeight, data.weightUnit)}
							</span>
							<span>
								Difference: {formatWeight(liveWeightWarning.difference, data.weightUnit)}
								(tolerance: {formatWeight(liveWeightWarning.tolerance, data.weightUnit)})
							</span>
						</div>
					{/if}
				</div>

				<div class="form-group">
					<label for="note">Note (optional)</label>
					<textarea id="note" name="note" rows="3">{form?.values?.note ?? ''}</textarea>
				</div>

				<div class="form-actions">
					<button type="button" class="btn-cancel" onclick={cancelSelection}>Cancel</button>
					<button type="submit" class="btn-submit">Confirm Check In</button>
				</div>
			</form>
		</section>
	{/if}
</div>

<ConfirmDialog
	open={showPlayAndTakeDialog}
	title="Play & Take"
	message="Does the attendee want to take this game home?"
	confirmLabel="Yes, take it"
	cancelLabel="No, return it"
	onConfirm={() => confirmPlayAndTake(true)}
	onCancel={() => confirmPlayAndTake(false)}
/>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.checkin-layout {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}

	.game-list-section {
		flex: 1;
		min-width: 0;
	}

	.game-title {
		font-weight: 600;
		color: #111827;
	}

	.duration {
		color: #6b7280;
		font-size: 0.85rem;
	}

	:global(.selected-row) {
		background-color: #f5f3ff !important;
	}

	.btn-checkin {
		padding: 0.35rem 0.75rem;
		background-color: #10b981;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 0.15s;
	}

	.btn-checkin:hover:not(:disabled) {
		background-color: #059669;
	}

	.btn-checkin:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.checkin-form-section {
		width: 360px;
		flex-shrink: 0;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		padding: 1.25rem;
		background: #fff;
		position: sticky;
		top: 1rem;
	}

	.checkin-form-section h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: #111827;
	}

	.id-reminder {
		padding: 0.6rem 0.75rem;
		background-color: #dbeafe;
		border: 1px solid #3b82f6;
		border-radius: 6px;
		color: #1e40af;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}

	.raffle-reminder {
		padding: 0.6rem 0.75rem;
		background-color: #d1fae5;
		border: 1px solid #10b981;
		border-radius: 6px;
		color: #065f46;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
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

	.form-group input,
	.form-group textarea {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		border-color: #10b981;
		box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
	}

	.form-group textarea {
		resize: vertical;
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
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 6px;
		font-size: 0.8rem;
		color: #92400e;
	}

	.inline-weight-warning strong {
		font-size: 0.82rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
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
		transition: background-color 0.15s;
	}

	.btn-cancel:hover {
		background-color: #e5e7eb;
	}

	.btn-submit {
		flex: 1;
		padding: 0.5rem;
		background-color: #10b981;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-submit:hover {
		background-color: #059669;
	}

	@media (max-width: 768px) {
		.checkin-layout {
			flex-direction: column;
		}

		.checkin-form-section {
			width: 100%;
			position: static;
		}
	}
</style>
