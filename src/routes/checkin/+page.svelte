<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance, applyAction, deserialize } from '$app/forms';
	import toast from 'svelte-hot-french-toast';
	import SearchFilter from '$lib/components/SearchFilter.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import GameCard from '$lib/components/GameCard.svelte';
	import WeightWarning from '$lib/components/WeightWarning.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { formatDuration } from '$lib/utils/formatting';

	type CheckedOutGame = {
		id: number;
		title: string;
		bggId: number;
		copyNumber: number;
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

	type WeightWarningData = {
		checkoutWeight: number;
		checkinWeight: number;
		difference: number;
		tolerance: number;
		weightUnit: string;
	};

	let { data, form }: {
		data: {
			games: PaginatedResult;
			weightUnit: string;
		};
		form: {
			errors?: Record<string, string>;
			values?: Record<string, unknown>;
			gameId?: number;
			success?: boolean;
			conflict?: boolean;
			message?: string;
			weightWarning?: WeightWarningData;
		} | null;
	} = $props();

	let selectedGame: CheckedOutGame | null = $state(null);
	let weightWarning: WeightWarningData | null = $state(null);
	let showPlayAndTakeDialog = $state(false);
	let pendingFormElement: HTMLFormElement | null = $state(null);

	function handleSearch(term: string) {
		const url = new URL(window.location.href);
		if (term) {
			url.searchParams.set('search', term);
		} else {
			url.searchParams.delete('search');
		}
		url.searchParams.delete('page');
		goto(url.toString(), { replaceState: true, keepFocus: true });
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
		weightWarning = null;
	}

	function cancelSelection() {
		selectedGame = null;
	}

	function gameDisplayTitle(game: CheckedOutGame): string {
		return game.copyNumber > 0 ? `${game.title} (Copy #${game.copyNumber})` : game.title;
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
			// Set the hidden field value before submitting
			const hiddenInput = pendingFormElement.querySelector('input[name="attendeeTakesGame"]') as HTMLInputElement;
			if (hiddenInput) {
				hiddenInput.value = takes ? 'true' : 'false';
			}
			// Submit the form directly via fetch to bypass the use:enhance SubmitFunction
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
					const data = (result as any).data;
					if (data?.weightWarning) {
						weightWarning = data.weightWarning;
					} else {
						weightWarning = null;
					}
					toast.success('Game checked in successfully!');
					selectedGame = null;
				}
				await applyAction(result);
				await invalidateAll();
			});
		}
	}

	const selectedGameTitle = $derived(selectedGame ? gameDisplayTitle(selectedGame) : '');
</script>

<h1>Check In</h1>

{#if weightWarning}
	<div class="weight-warning-container">
		<WeightWarning
			checkoutWeight={weightWarning.checkoutWeight}
			checkinWeight={weightWarning.checkinWeight}
			tolerance={weightWarning.tolerance}
			weightUnit={weightWarning.weightUnit}
			onDismiss={() => { weightWarning = null; }}
		/>
	</div>
{/if}

<div class="checkin-layout">
	<section class="game-list-section">
		<div class="search-bar">
			<SearchFilter
				value={new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost').searchParams.get('search') || ''}
				placeholder="Search by game title or attendee name..."
				onSearch={handleSearch}
			/>
		</div>

		{#if data.games.items.length === 0}
			<p class="empty-message">No checked-out games found.</p>
		{:else}
			<div class="game-cards">
				{#each data.games.items as game (game.id)}
					<GameCard
						title={game.title}
						bggId={game.bggId}
						copyNumber={game.copyNumber}
						gameType={game.gameType}
						selected={selectedGame?.id === game.id}
					>
						{#snippet children()}
							<div class="game-checkout-info">
								<span class="attendee-name">{attendeeName(game)}</span>
								<span class="checkout-duration">{getCheckoutDuration(game)}</span>
							</div>
							<button
								class="btn-checkin"
								onclick={() => selectGame(game)}
								disabled={selectedGame?.id === game.id}
							>
								Check In
							</button>
						{/snippet}
					</GameCard>
				{/each}
			</div>
		{/if}

		<Pagination
			totalItems={data.games.total}
			currentPage={data.games.page}
			pageSize={data.games.pageSize}
			onPageChange={handlePageChange}
			onPageSizeChange={handlePageSizeChange}
		/>
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
						const data = (result as any).data;
						if (data?.weightWarning) {
							weightWarning = data.weightWarning;
						} else {
							weightWarning = null;
						}
						toast.success('Game checked in successfully!');
						selectedGame = null;
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
					<input
						id="checkinWeight"
						name="checkinWeight"
						type="number"
						step="0.1"
						min="0.1"
						required
						value={form?.values?.checkinWeight ?? ''}
					/>
					{#if form?.errors?.checkinWeight}
						<span class="field-error">{form.errors.checkinWeight}</span>
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

	.weight-warning-container {
		margin-bottom: 1rem;
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

	.search-bar {
		margin-bottom: 1rem;
	}

	.empty-message {
		color: #6b7280;
		font-size: 0.9rem;
		padding: 2rem 0;
		text-align: center;
	}

	.game-cards {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.game-checkout-info {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
		margin-right: 0.75rem;
		font-size: 0.8rem;
	}

	.attendee-name {
		color: #374151;
		font-weight: 500;
	}

	.checkout-duration {
		color: #6b7280;
	}

	.btn-checkin {
		padding: 0.4rem 0.9rem;
		background-color: #10b981;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
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
