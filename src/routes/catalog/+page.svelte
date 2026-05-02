<script lang="ts">
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import SearchFilter from '$lib/components/SearchFilter.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import GameCard from '$lib/components/GameCard.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';

	const wsClient: { connected: boolean } = getContext('ws');

	type GameRecord = {
		id: number;
		title: string;
		bggId: number;
		copyNumber: number;
		totalCopies: number;
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

	let { data }: {
		data: {
			games: PaginatedResult;
			activeStatus: string;
			activeGameType: string;
			activeSearch: string;
		};
	} = $props();

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

	function handleSearch(term: string) {
		updateUrl({ search: term });
	}

	function handleStatusChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		updateUrl({ status: value });
	}

	function handleGameTypeChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		updateUrl({ gameType: value });
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

	function statusLabel(status: string): string {
		switch (status) {
			case 'available': return 'Available';
			case 'checked_out': return 'Checked Out';
			default: return status;
		}
	}
</script>

<h1>Catalog <ConnectionIndicator connected={wsClient.connected} /></h1>

<div class="filter-bar">
	<div class="search-field">
		<SearchFilter
			value={data.activeSearch}
			placeholder="Search by game title..."
			onSearch={handleSearch}
		/>
	</div>

	<div class="filter-selects">
		<select
			class="filter-select"
			value={data.activeStatus}
			onchange={handleStatusChange}
			aria-label="Filter by status"
		>
			<option value="">All Statuses</option>
			<option value="available">Available</option>
			<option value="checked_out">Checked Out</option>
		</select>

		<select
			class="filter-select"
			value={data.activeGameType}
			onchange={handleGameTypeChange}
			aria-label="Filter by game type"
		>
			<option value="">All Types</option>
			<option value="standard">Standard</option>
			<option value="play_and_win">Play & Win</option>
			<option value="play_and_take">Play & Take</option>
		</select>
	</div>
</div>

{#if data.games.items.length === 0}
	<p class="empty-message">No games found matching your filters.</p>
{:else}
	<div class="game-cards">
		{#each data.games.items as game (game.id)}
			<GameCard
				title={game.title}
				bggId={game.bggId}
				copyNumber={game.copyNumber}
				totalCopies={game.totalCopies}
				gameType={game.gameType}
			>
				<span class="status-indicator {game.status}">
					{statusLabel(game.status)}
				</span>
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

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.filter-bar {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.search-field {
		flex: 1;
		min-width: 200px;
	}

	.filter-selects {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.filter-select {
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		color: #374151;
		background: #fff;
		outline: none;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.filter-select:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
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

	.status-indicator {
		display: inline-block;
		padding: 0.2em 0.6em;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.status-indicator.available {
		background-color: #d1fae5;
		color: #065f46;
	}

	.status-indicator.checked_out {
		background-color: #fee2e2;
		color: #991b1b;
	}

	@media (max-width: 640px) {
		.filter-bar {
			flex-direction: column;
		}

		.search-field {
			width: 100%;
		}

		.filter-selects {
			width: 100%;
		}

		.filter-select {
			flex: 1;
		}
	}
</style>
