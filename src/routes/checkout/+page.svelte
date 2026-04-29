<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';
	import SearchFilter from '$lib/components/SearchFilter.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import GameCard from '$lib/components/GameCard.svelte';

	type GameRecord = {
		id: number;
		title: string;
		bggId: number;
		copyNumber: number;
		status: string;
		gameType: 'standard' | 'play_and_win' | 'play_and_take';
		version: number;
	};

	type PaginatedResult = {
		items: GameRecord[];
		total: number;
		page: number;
		pageSize: number;
	};

	let { data, form }: {
		data: {
			games: PaginatedResult;
			idTypes: string[];
			weightUnit: string;
		};
		form: {
			errors?: Record<string, string>;
			values?: Record<string, unknown>;
			success?: boolean;
			conflict?: boolean;
			message?: string;
		} | null;
	} = $props();

	let selectedGame: GameRecord | null = $state(null);

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

	function selectGame(game: GameRecord) {
		selectedGame = game;
	}

	function cancelSelection() {
		selectedGame = null;
	}

	function gameDisplayTitle(game: GameRecord): string {
		return game.copyNumber > 0 ? `${game.title} (Copy #${game.copyNumber})` : game.title;
	}

	// Used by GameCard for display title in the form header
	const selectedGameTitle = $derived(selectedGame ? gameDisplayTitle(selectedGame) : '');
</script>

<h1>Checkout</h1>

<div class="checkout-layout">
	<section class="game-list-section">
		<div class="search-bar">
			<SearchFilter
				value={new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost').searchParams.get('search') || ''}
				placeholder="Search available games..."
				onSearch={handleSearch}
			/>
		</div>

		{#if data.games.items.length === 0}
			<p class="empty-message">No available games found.</p>
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
						<button
							class="btn-checkout"
							onclick={() => selectGame(game)}
							disabled={selectedGame?.id === game.id}
						>
							Checkout
						</button>
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
		<section class="checkout-form-section" aria-label="Checkout form">
			<h2>Checking out: {selectedGameTitle}</h2>

			<form method="POST" action="?/checkout" use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						toast.success('Game checked out successfully!');
						selectedGame = null;
					} else if (result.type === 'failure') {
						const data = (result as any).data;
						if (data?.conflict) {
							toast.error(data.message || 'This game was just checked out by another station.');
						} else if (data?.error) {
							toast.error(data.error);
						}
					}
					await update({ reset: false });
				};
			}} novalidate>
				<input type="hidden" name="gameId" value={selectedGame.id} />
				<input type="hidden" name="gameVersion" value={selectedGame.version} />

				<div class="form-group">
					<label for="attendeeFirstName">First Name</label>
					<input
						id="attendeeFirstName"
						name="attendeeFirstName"
						type="text"
						required
						value={form?.values?.attendeeFirstName ?? ''}
					/>
					{#if form?.errors?.attendeeFirstName}
						<span class="field-error">{form.errors.attendeeFirstName}</span>
					{/if}
				</div>

				<div class="form-group">
					<label for="attendeeLastName">Last Name</label>
					<input
						id="attendeeLastName"
						name="attendeeLastName"
						type="text"
						required
						value={form?.values?.attendeeLastName ?? ''}
					/>
					{#if form?.errors?.attendeeLastName}
						<span class="field-error">{form.errors.attendeeLastName}</span>
					{/if}
				</div>

				<div class="form-group">
					<label for="idType">ID Type</label>
					<select id="idType" name="idType" required>
						<option value="">Select ID type...</option>
						{#each data.idTypes as idType (idType)}
							<option value={idType} selected={form?.values?.idType === idType}>{idType}</option>
						{/each}
					</select>
					{#if form?.errors?.idType}
						<span class="field-error">{form.errors.idType}</span>
					{/if}
				</div>

				<div class="form-group">
					<label for="checkoutWeight">Weight ({data.weightUnit})</label>
					<input
						id="checkoutWeight"
						name="checkoutWeight"
						type="number"
						step="0.1"
						min="0.1"
						required
						value={form?.values?.checkoutWeight ?? ''}
					/>
					{#if form?.errors?.checkoutWeight}
						<span class="field-error">{form.errors.checkoutWeight}</span>
					{/if}
				</div>

				<div class="form-group">
					<label for="note">Note (optional)</label>
					<textarea id="note" name="note" rows="3">{form?.values?.note ?? ''}</textarea>
				</div>

				<div class="form-actions">
					<button type="button" class="btn-cancel" onclick={cancelSelection}>Cancel</button>
					<button type="submit" class="btn-submit">Confirm Checkout</button>
				</div>
			</form>
		</section>
	{/if}
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.checkout-layout {
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

	.btn-checkout {
		padding: 0.4rem 0.9rem;
		background-color: #6366f1;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 0.15s;
	}

	.btn-checkout:hover:not(:disabled) {
		background-color: #4f46e5;
	}

	.btn-checkout:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.checkout-form-section {
		width: 360px;
		flex-shrink: 0;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		padding: 1.25rem;
		background: #fff;
		position: sticky;
		top: 1rem;
	}

	.checkout-form-section h2 {
		font-size: 1rem;
		font-weight: 600;
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
	.form-group select,
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
	.form-group select:focus,
	.form-group textarea:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
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

	@media (max-width: 768px) {
		.checkout-layout {
			flex-direction: column;
		}

		.checkout-form-section {
			width: 100%;
			position: static;
		}
	}
</style>
