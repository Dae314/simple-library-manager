<script lang="ts">
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import GameTypeBadge from '$lib/components/GameTypeBadge.svelte';
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
			sortField: string;
			sortDir: string;
		};
	} = $props();

	const columns = [
		{ key: 'title', label: 'Title', sortField: 'title' },
		{ key: 'type', label: 'Type', sortField: 'game_type' },
		{ key: 'status', label: 'Status', sortField: 'status' },
		{ key: 'bggId', label: 'BGG', sortField: 'bgg_id' }
	];

	const filters = [
		{ key: 'search', label: 'Search', type: 'text' as const, placeholder: 'Search by game title...' },
		{
			key: 'status', label: 'Status', type: 'select' as const,
			options: [
				{ value: 'available', label: 'Available' },
				{ value: 'checked_out', label: 'Checked Out' }
			]
		},
		{
			key: 'gameType', label: 'Type', type: 'select' as const,
			options: [
				{ value: 'standard', label: 'Standard' },
				{ value: 'play_and_win', label: 'Play & Win' },
				{ value: 'play_and_take', label: 'Play & Take' }
			]
		}
	];

	let filterValues = $derived({
		search: data.activeSearch,
		status: data.activeStatus,
		gameType: data.activeGameType
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
		const params: Record<string, string> = {};
		for (const [key, value] of Object.entries(values)) {
			params[key] = String(value ?? '');
		}
		updateUrl(params);
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

	function gameDisplayTitle(game: GameRecord): string {
		return game.totalCopies > 1 ? `${game.title} (Copy #${game.copyNumber})` : game.title;
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
	emptyMessage="No games found matching your filters."
	onSort={handleSort}
	onFilterChange={handleFilterChange}
	onPageChange={handlePageChange}
	onPageSizeChange={handlePageSizeChange}
>
	{#snippet row(game)}
		<tr>
			<td>
				<span class="game-title">{gameDisplayTitle(game)}</span>
			</td>
			<td><GameTypeBadge gameType={game.gameType} /></td>
			<td>
				<span class="status-indicator {game.status}">
					{statusLabel(game.status)}
				</span>
			</td>
			<td>
				<a
					href="https://boardgamegeek.com/boardgame/{game.bggId}"
					target="_blank"
					rel="noopener noreferrer"
					class="bgg-link"
				>#{game.bggId}</a>
			</td>
		</tr>
	{/snippet}
</SortableTable>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.game-title {
		font-weight: 600;
		color: #111827;
	}

	.bgg-link {
		font-size: 0.8rem;
		color: #6366f1;
		text-decoration: none;
	}

	.bgg-link:hover {
		text-decoration: underline;
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
</style>
