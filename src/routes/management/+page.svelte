<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import GameCard from '$lib/components/GameCard.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import toast from 'svelte-hot-french-toast';

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

	type FilterValues = {
		search: string;
		status: string;
		gameType: string;
		sortField: string;
		sortDir: string;
		createdSince: string;
		lastCheckedOutBefore: string;
		lastTransactionStart: string;
		lastTransactionEnd: string;
		groupByBgg: boolean;
		page: number;
		pageSize: number;
	};

	let { data }: {
		data: {
			games: PaginatedResult;
			filters: FilterValues;
		};
	} = $props();

	let selectedIds: Set<number> = $state(new Set());
	let showRetireDialog = $state(false);

	const filterConfigs = [
		{ key: 'search', label: 'Title Search', type: 'text' as const, placeholder: 'Search by title...' },
		{
			key: 'status', label: 'Status', type: 'select' as const,
			options: [
				{ value: 'available', label: 'Available' },
				{ value: 'checked_out', label: 'Checked Out' },
				{ value: 'retired', label: 'Retired' }
			]
		},
		{
			key: 'gameType', label: 'Game Type', type: 'select' as const,
			options: [
				{ value: 'standard', label: 'Standard' },
				{ value: 'play_and_win', label: 'Play & Win' },
				{ value: 'play_and_take', label: 'Play & Take' }
			]
		},
		{
			key: 'sortField', label: 'Sort By', type: 'select' as const,
			options: [
				{ value: 'title', label: 'Title' },
				{ value: 'bgg_id', label: 'BGG ID' },
				{ value: 'status', label: 'Status' },
				{ value: 'game_type', label: 'Game Type' },
				{ value: 'last_transaction_date', label: 'Last Transaction' }
			]
		},
		{
			key: 'sortDir', label: 'Sort Direction', type: 'select' as const,
			options: [
				{ value: 'asc', label: 'Ascending' },
				{ value: 'desc', label: 'Descending' }
			]
		},
		{ key: 'createdSince', label: 'Added Since', type: 'date' as const },
		{ key: 'lastCheckedOutBefore', label: 'Last Checked Out Before', type: 'date' as const },
		{ key: 'lastTransactionStart', label: 'Last Transaction From', type: 'date' as const },
		{ key: 'lastTransactionEnd', label: 'Last Transaction To', type: 'date' as const },
		{ key: 'groupByBgg', label: 'Group by BGG Title', type: 'toggle' as const }
	];

	let filterValues = $derived({
		search: data.filters.search,
		status: data.filters.status,
		gameType: data.filters.gameType,
		sortField: data.filters.sortField,
		sortDir: data.filters.sortDir,
		createdSince: data.filters.createdSince,
		lastCheckedOutBefore: data.filters.lastCheckedOutBefore,
		lastTransactionStart: data.filters.lastTransactionStart,
		lastTransactionEnd: data.filters.lastTransactionEnd,
		groupByBgg: data.filters.groupByBgg
	});

	let selectedCount = $derived(selectedIds.size);
	let allSelected = $derived(
		data.games.items.length > 0 && data.games.items.every((g) => selectedIds.has(g.id))
	);

	let selectedCheckedOutGames = $derived(
		data.games.items.filter((g) => selectedIds.has(g.id) && g.status === 'checked_out')
	);

	let retireWarning = $derived(
		selectedCheckedOutGames.length > 0
			? `Warning: ${selectedCheckedOutGames.length} selected game(s) are currently checked out: ${selectedCheckedOutGames.map((g) => g.title).join(', ')}`
			: ''
	);

	let selectedRetiredGames = $derived(
		data.games.items.filter((g) => selectedIds.has(g.id) && g.status === 'retired')
	);

	let selectedNonRetiredGames = $derived(
		data.games.items.filter((g) => selectedIds.has(g.id) && g.status !== 'retired')
	);

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
			if (typeof value === 'boolean') {
				params[key] = value ? 'true' : '';
			} else {
				params[key] = String(value ?? '');
			}
		}
		updateUrl(params);
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

	function toggleSelect(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (allSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(data.games.items.map((g) => g.id));
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'available': return 'Available';
			case 'checked_out': return 'Checked Out';
			case 'retired': return 'Retired';
			default: return status;
		}
	}
</script>

<div class="management-page">
	<div class="page-header">
		<h1>Game Management</h1>
		<div class="header-actions">
			<a href="/management/games/new" class="btn btn-primary">+ Add Game</a>
			<a href="/management/transactions" class="btn btn-secondary">Transaction Log</a>
		</div>
	</div>

	<FilterPanel
		filters={filterConfigs}
		values={filterValues}
		onChange={handleFilterChange}
	/>

	{#if selectedCount > 0}
		<div class="bulk-actions">
			<span class="selected-count">{selectedCount} selected</span>
			{#if selectedNonRetiredGames.length > 0}
				<button class="btn btn-danger" onclick={() => (showRetireDialog = true)}>
					Retire Selected ({selectedNonRetiredGames.length})
				</button>
			{/if}
			{#if selectedRetiredGames.length > 0}
				{#each selectedRetiredGames as game (game.id)}
					<form method="POST" action="?/restore" use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								toast.success(`Restored "${game.title}"`);
								selectedIds = new Set([...selectedIds].filter((id) => id !== game.id));
							} else {
								toast.error('Failed to restore game');
							}
							await update();
						};
					}}>
						<input type="hidden" name="id" value={game.id} />
						<button type="submit" class="btn btn-restore">
							Restore "{game.title}"
						</button>
					</form>
				{/each}
			{/if}
		</div>
	{/if}

	{#if data.games.items.length === 0}
		<p class="empty-message">No games found matching your filters.</p>
	{:else}
		<div class="game-list">
			<div class="select-all-row">
				<label class="checkbox-label">
					<input
						type="checkbox"
						checked={allSelected}
						onchange={toggleSelectAll}
						aria-label="Select all games"
					/>
					Select all
				</label>
			</div>

			{#each data.games.items as game (game.id)}
				<div class="game-row" class:selected={selectedIds.has(game.id)}>
					<label class="game-checkbox">
						<input
							type="checkbox"
							checked={selectedIds.has(game.id)}
							onchange={() => toggleSelect(game.id)}
							aria-label="Select {game.title}"
						/>
					</label>
					<div class="game-content">
						<GameCard
							title={game.title}
							bggId={game.bggId}
							copyNumber={game.copyNumber}
							gameType={game.gameType}
							selected={selectedIds.has(game.id)}
						>
							<div class="game-status-actions">
								<span class="status-indicator {game.status}">
									{statusLabel(game.status)}
								</span>
								<a href="/management/games/{game.id}" class="btn-edit" aria-label="Edit {game.title}">
									Edit
								</a>
							</div>
						</GameCard>
					</div>
				</div>
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
</div>

<ConfirmDialog
	open={showRetireDialog}
	title="Retire Selected Games"
	message="Are you sure you want to retire {selectedNonRetiredGames.length} game(s)? Retired games will be hidden from checkout and checkin views."
	warning={retireWarning}
	confirmLabel="Retire"
	cancelLabel="Cancel"
	onCancel={() => (showRetireDialog = false)}
	onConfirm={() => {
		showRetireDialog = false;
		const retireForm = document.getElementById('retire-form') as HTMLFormElement;
		if (retireForm) retireForm.requestSubmit();
	}}
/>

<form
	id="retire-form"
	method="POST"
	action="?/retire"
	class="hidden-form"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				toast.success(`Retired ${selectedNonRetiredGames.length} game(s)`);
				selectedIds = new Set();
			} else {
				toast.error('Failed to retire games');
			}
			await update();
		};
	}}
>
	<input type="hidden" name="ids" value={selectedNonRetiredGames.map((g) => g.id).join(',')} />
</form>

<style>
	.management-page {
		max-width: 960px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #111827;
		margin: 0;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn {
		display: inline-block;
		padding: 0.45rem 0.9rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background-color 0.15s;
	}

	.btn-primary {
		background-color: #6366f1;
		color: #fff;
	}

	.btn-primary:hover {
		background-color: #4f46e5;
	}

	.btn-secondary {
		background-color: #f3f4f6;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-secondary:hover {
		background-color: #e5e7eb;
	}

	.btn-danger {
		background-color: #ef4444;
		color: #fff;
	}

	.btn-danger:hover {
		background-color: #dc2626;
	}

	.btn-restore {
		background-color: #10b981;
		color: #fff;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		border: none;
		transition: background-color 0.15s;
	}

	.btn-restore:hover {
		background-color: #059669;
	}

	.bulk-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background-color: #f0f0ff;
		border: 1px solid #c7d2fe;
		border-radius: 6px;
		margin: 1rem 0;
		flex-wrap: wrap;
	}

	.selected-count {
		font-size: 0.875rem;
		font-weight: 600;
		color: #4338ca;
	}

	.empty-message {
		color: #6b7280;
		font-size: 0.9rem;
		padding: 2rem 0;
		text-align: center;
	}

	.game-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
	}

	.select-all-row {
		padding: 0.5rem 0.75rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: #4b5563;
		cursor: pointer;
	}

	.game-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.game-row.selected {
		border-radius: 6px;
	}

	.game-checkbox {
		flex-shrink: 0;
		cursor: pointer;
		padding: 0.25rem;
	}

	.game-content {
		flex: 1;
		min-width: 0;
	}

	.game-status-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.status-indicator.retired {
		background-color: #e5e7eb;
		color: #6b7280;
	}

	.btn-edit {
		font-size: 0.8rem;
		color: #6366f1;
		text-decoration: none;
		padding: 0.2em 0.5em;
		border-radius: 4px;
		transition: background-color 0.15s;
	}

	.btn-edit:hover {
		background-color: #eef2ff;
		text-decoration: underline;
	}

	.hidden-form {
		display: none;
	}

	@media (max-width: 640px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.header-actions {
			width: 100%;
		}

		.header-actions .btn {
			flex: 1;
			text-align: center;
		}
	}
</style>
