<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { getContext, onMount } from 'svelte';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import GameTypeBadge from '$lib/components/GameTypeBadge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import toast from 'svelte-hot-french-toast';
	import { getPreferredPageSize, savePreferredPageSize } from '$lib/utils/page-size.js';

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

	let { data, form }: {
		data: {
			games: PaginatedResult;
			filters: FilterValues;
		};
		form: any;
	} = $props();

	let selectedIds: Set<number> = $state(new Set());
	let showRetireDialog = $state(false);
	let showCsvImportDialog = $state(false);
	let csvFileInput: HTMLInputElement | undefined = $state();
	let csvValidationResult: {
		valid: boolean;
		errors: { row: number; message: string }[];
		rowCount: number;
		summary: { add: number; modify: number; delete: number };
	} | null = $state(null);
	let csvFileForImport: File | null = $state(null);
	let confirmPassword = $state('');
	let csvImportDialogEl: HTMLDialogElement | undefined = $state();

	let isPasswordSet = $derived($page.data.isPasswordSet);

	// Show success toast after game deletion redirect (?deleted=1)
	onMount(() => {
		if ($page.url.searchParams.get('deleted') === '1') {
			toast.success('Game deleted successfully');
			goto($page.url.pathname, { replaceState: true });
		}
	});

	$effect(() => {
		if (!csvImportDialogEl) return;
		if (showCsvImportDialog && !csvImportDialogEl.open) {
			csvImportDialogEl.showModal();
		} else if (!showCsvImportDialog && csvImportDialogEl.open) {
			csvImportDialogEl.close();
		}
	});

	const columns = [
		{ key: 'select', label: 'Select', srOnly: true },
		{ key: 'title', label: 'Title', sortField: 'title' },
		{ key: 'type', label: 'Type', sortField: 'game_type' },
		{ key: 'status', label: 'Status', sortField: 'status' },
		{ key: 'bggId', label: 'BGG', sortField: 'bgg_id' },
		{ key: 'actions', label: 'Actions', srOnly: true }
	];

	const filterConfigs = [
		{ key: 'search', label: 'Search', type: 'text' as const, placeholder: 'Search by title...' },
		{
			key: 'status', label: 'Status', type: 'select' as const,
			placeholder: 'Non-Retired',
			options: [
				{ value: 'available', label: 'Available' },
				{ value: 'checked_out', label: 'Checked Out' },
				{ value: 'retired', label: 'Retired' }
			]
		},
		{
			key: 'gameType', label: 'Type', type: 'select' as const,
			options: [
				{ value: 'standard', label: 'Standard' },
				{ value: 'play_and_win', label: 'Play & Win' },
				{ value: 'play_and_take', label: 'Play & Take' }
			]
		},
		{ key: 'createdSince', label: 'Added Since', type: 'date' as const },
		{ key: 'lastCheckedOutBefore', label: 'Last Checkout Before', type: 'date' as const },
		{ key: 'lastTransactionStart', label: 'Last Tx After', type: 'date' as const },
		{ key: 'lastTransactionEnd', label: 'Last Tx Before', type: 'date' as const },
		{ key: 'groupByBgg', label: 'Group by BGG Title', type: 'toggle' as const }
	];

	let filterValues = $derived({
		search: data.filters.search,
		status: data.filters.status,
		gameType: data.filters.gameType,
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

	let selectedNonRetiredGames = $derived(
		data.games.items.filter((g) => selectedIds.has(g.id) && g.status !== 'retired')
	);

	function handleCsvValidationResult(validationResult: any) {
		csvValidationResult = validationResult;
		if (validationResult.valid) {
			showCsvImportDialog = true;
		}
	}

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

	function handleSort(field: string, direction: 'asc' | 'desc') {
		updateUrl({ sortField: field, sortDir: direction });
	}

	function handlePageChange(page: number) {
		const url = new URL(window.location.href);
		url.searchParams.set('page', String(page));
		goto(url.toString(), { replaceState: true });
	}

	function handlePageSizeChange(size: number) {
		savePreferredPageSize(size);
		const url = new URL(window.location.href);
		url.searchParams.set('pageSize', String(size));
		url.searchParams.set('page', '1');
		goto(url.toString(), { replaceState: true });
	}

	// Apply stored page size preference when navigating to this page without an explicit pageSize param
	onMount(() => {
		const currentUrl = new URL(window.location.href);
		if (!currentUrl.searchParams.has('pageSize')) {
			const preferred = getPreferredPageSize();
			if (preferred !== data.games.pageSize) {
				currentUrl.searchParams.set('pageSize', String(preferred));
				currentUrl.searchParams.set('page', '1');
				goto(currentUrl.toString(), { replaceState: true });
			}
		}
	});

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

	function navigateToGame(e: MouseEvent, gameId: number) {
		const target = e.target as HTMLElement;
		if (target.closest('button, a, input, form, label')) return;
		goto(`/management/games/${gameId}`);
	}

	function handleCsvFileSelect() {
		const file = csvFileInput?.files?.[0];
		if (file) {
			csvFileForImport = file;
			csvValidationResult = null;
			const validateForm = document.getElementById('csv-validate-form') as HTMLFormElement;
			if (validateForm) {
				const dt = new DataTransfer();
				dt.items.add(file);
				const fileInput = validateForm.querySelector('input[name="csvFile"]') as HTMLInputElement;
				if (fileInput) {
					fileInput.files = dt.files;
					validateForm.requestSubmit();
				}
			}
		}
	}

	function gameDisplayTitle(game: GameRecord): string {
		return game.totalCopies > 1 ? `${game.title} (Copy #${game.copyNumber})` : game.title;
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
		<div class="header-left">	
			<a href="/management" class="back-link" aria-label="Back to management">&larr; Management</a>
			<h1>Games <ConnectionIndicator connected={wsClient.connected} /></h1>
		</div>
		<div class="header-actions">
			<a href="/management/games/new" class="btn btn-primary">+ Add Game</a>
			<form method="POST" action="?/csvExport" use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						const data = (result as any).data;
						if (data?.csvExportData) {
							const blob = new Blob([data.csvExportData], { type: 'text/csv' });
							const url = URL.createObjectURL(blob);
							const a = document.createElement('a');
							a.href = url;
							a.download = 'games-export.csv';
							a.click();
							URL.revokeObjectURL(url);
							toast.success('CSV exported successfully');
						}
					}
					await update({ reset: false });
				};
			}}>
				<button type="submit" class="btn btn-secondary">CSV Export</button>
			</form>
			<button class="btn btn-secondary" onclick={() => csvFileInput?.click()}>CSV Import</button>
			<input
				bind:this={csvFileInput}
				type="file"
				accept=".csv"
				class="hidden-input"
				onchange={handleCsvFileSelect}
			/>
		</div>
	</div>

	{#if csvValidationResult && !csvValidationResult.valid}
		<div class="csv-errors">
			<h3>CSV Validation Errors</h3>
			<ul>
				{#each csvValidationResult.errors as err}
					<li>Row {err.row}: {err.message}</li>
				{/each}
			</ul>
			<button class="btn btn-secondary" onclick={() => { csvValidationResult = null; csvFileForImport = null; }}>Dismiss</button>
		</div>
	{/if}

	<SortableTable
		{columns}
		items={data.games.items}
		totalItems={data.games.total}
		currentPage={data.games.page}
		pageSize={data.games.pageSize}
		sortField={data.filters.sortField}
		sortDirection={data.filters.sortDir}
		filters={filterConfigs}
		{filterValues}
		emptyMessage="No games found matching your filters."
		onSort={handleSort}
		onFilterChange={handleFilterChange}
		onPageChange={handlePageChange}
		onPageSizeChange={handlePageSizeChange}
	>
		{#snippet aboveTable()}
			{#if selectedCount > 0}
				<div class="bulk-actions">
					<span class="selected-count">{selectedCount} selected</span>
					{#if selectedNonRetiredGames.length > 0}
						<button class="btn btn-danger" onclick={() => (showRetireDialog = true)}>
							Retire Selected ({selectedNonRetiredGames.length})
						</button>
					{/if}
				</div>
			{/if}
		{/snippet}

		{#snippet row(game)}
			<tr
				class="clickable-row"
				class:selected-row={selectedIds.has(game.id)}
				onclick={(e) => navigateToGame(e, game.id)}
			>
				<td class="checkbox-cell">
					<label>
						<input
							type="checkbox"
							checked={selectedIds.has(game.id)}
							onchange={() => toggleSelect(game.id)}
							aria-label="Select {game.title}"
						/>
					</label>
				</td>
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
				<td class="actions-cell">
					{#if game.status !== 'retired'}
						<form method="POST" action="?/retire" use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success(`Retired "${game.title}"`);
								} else if (result.type === 'failure') {
									const data = (result as any).data;
									toast.error(data?.error || 'Failed to retire game');
								}
								await update();
							};
						}}>
							<input type="hidden" name="ids" value={game.id} />
							<button type="submit" class="btn-inline btn-inline-danger" aria-label="Retire {game.title}">
								Retire
							</button>
						</form>
					{:else}
						<form method="POST" action="?/restore" use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success(`Restored "${game.title}"`);
									selectedIds = new Set([...selectedIds].filter((id) => id !== game.id));
								} else if (result.type === 'failure') {
									const data = (result as any).data;
									toast.error(data?.error || 'Failed to restore game');
								}
								await update();
							};
						}}>
							<input type="hidden" name="id" value={game.id} />
							<button type="submit" class="btn-inline btn-inline-restore" aria-label="Restore {game.title}">
								Restore
							</button>
						</form>
					{/if}
					<a href="/management/games/{game.id}" class="btn-edit" aria-label="Edit {game.title}">
						Edit
					</a>
				</td>
			</tr>
		{/snippet}

		{#snippet headerActions()}
			<label class="select-all-label">
				<input
					type="checkbox"
					checked={allSelected}
					onchange={toggleSelectAll}
					aria-label="Select all games"
				/>
				Select all
			</label>
		{/snippet}
	</SortableTable>
</div>

<!-- Bulk Retire Confirm Dialog -->
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
			} else if (result.type === 'failure') {
				const data = (result as any).data;
				toast.error(data?.error || 'Failed to retire games');
			}
			await update();
		};
	}}
>
	<input type="hidden" name="ids" value={selectedNonRetiredGames.map((g) => g.id).join(',')} />
</form>

<!-- CSV Validate Form (hidden) -->
<form
	id="csv-validate-form"
	method="POST"
	action="?/csvValidate"
	enctype="multipart/form-data"
	class="hidden-form"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const data = (result as any).data;
				if (data?.csvValidation) {
					handleCsvValidationResult(data.csvValidation);
				}
			} else if (result.type === 'failure') {
				const data = (result as any).data;
				if (data?.csvError) {
					toast.error(data.csvError);
				}
			}
			await update({ reset: false });
		};
	}}
>
	<input type="file" name="csvFile" accept=".csv" />
</form>

<!-- CSV Import Confirm Dialog (custom dialog to support password field) -->
<dialog
	bind:this={csvImportDialogEl}
	class="confirm-dialog"
	aria-label="Import CSV"
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			showCsvImportDialog = false;
			csvValidationResult = null;
			csvFileForImport = null;
			confirmPassword = '';
		}
	}}
	onclick={(e) => {
		const rect = csvImportDialogEl?.getBoundingClientRect();
		if (!rect) return;
		const clickedInside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (!clickedInside) {
			showCsvImportDialog = false;
			csvValidationResult = null;
			csvFileForImport = null;
			confirmPassword = '';
		}
	}}
>
	<div class="dialog-content">
		<h2 class="dialog-title">Import CSV</h2>
		<p class="dialog-message">
			{#if csvValidationResult?.valid}
				{@const s = csvValidationResult.summary}
				{@const parts = [
					...(s.add > 0 ? [`${s.add} game(s) to add`] : []),
					...(s.modify > 0 ? [`${s.modify} game(s) to modify`] : []),
					...(s.delete > 0 ? [`${s.delete} game(s) to retire`] : [])
				]}
				CSV validated successfully. {parts.join(', ')}. Proceed?
			{/if}
		</p>
		{#if csvValidationResult?.summary?.delete}
			<p class="dialog-warning">{csvValidationResult.summary.delete} game(s) will be retired (soft-deleted). This can be undone by restoring them individually.</p>
		{/if}

		{#if isPasswordSet}
			<div class="dialog-password-field">
				<label for="csv-import-confirm-password">Enter your password to confirm</label>
				<input
					id="csv-import-confirm-password"
					type="password"
					autocomplete="current-password"
					bind:value={confirmPassword}
				/>
			</div>
		{/if}

		<div class="dialog-actions">
			<button class="btn-cancel" onclick={() => { showCsvImportDialog = false; csvValidationResult = null; csvFileForImport = null; confirmPassword = ''; }}>Cancel</button>
			<button
				class="btn-confirm"
				disabled={isPasswordSet && !confirmPassword}
				onclick={() => {
					showCsvImportDialog = false;
					const importForm = document.getElementById('csv-import-form') as HTMLFormElement;
					if (importForm && csvFileForImport) {
						const dt = new DataTransfer();
						dt.items.add(csvFileForImport);
						const fileInput = importForm.querySelector('input[name="csvFile"]') as HTMLInputElement;
						if (fileInput) {
							fileInput.files = dt.files;
						}
						const passwordInput = importForm.querySelector('input[name="confirmPassword"]') as HTMLInputElement;
						if (passwordInput) {
							passwordInput.value = confirmPassword;
						}
						importForm.requestSubmit();
					}
					confirmPassword = '';
				}}
			>Import</button>
		</div>
	</div>
</dialog>

<!-- CSV Import Form (hidden) -->
<form
	id="csv-import-form"
	method="POST"
	action="?/csvImport"
	enctype="multipart/form-data"
	class="hidden-form"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const data = (result as any).data;
				if (data?.csvImportSummary) {
					const s = data.csvImportSummary;
					const parts: string[] = [];
					if (s.added > 0) parts.push(`${s.added} added`);
					if (s.modified > 0) parts.push(`${s.modified} modified`);
					if (s.deleted > 0) parts.push(`${s.deleted} retired`);
					toast.success(`CSV import complete: ${parts.join(', ')}`);
				} else if (data?.csvImported) {
					toast.success(`Imported ${data.csvImported} game(s) from CSV`);
				}
				csvValidationResult = null;
				csvFileForImport = null;
				showCsvImportDialog = false;
			} else if (result.type === 'failure') {
				const data = (result as any).data;
				if (data?.csvError) {
					toast.error(data.csvError);
				}
			}
			await update({ reset: false });
		};
	}}
>
	<input type="file" name="csvFile" accept=".csv" />
	<input type="hidden" name="confirmPassword" />
</form>

<style>
	.management-page {
		max-width: 960px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.back-link {
		font-size: 0.85rem;
		color: #6366f1;
		text-decoration: none;
	}

	.back-link:hover {
		text-decoration: underline;
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
		align-items: center;
		flex-wrap: wrap;
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
		background-color: #fff;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-secondary:hover {
		background-color: #f3f4f6;
	}

	.btn-danger {
		background-color: #ef4444;
		color: #fff;
	}

	.btn-danger:hover {
		background-color: #dc2626;
	}

	.hidden-input {
		display: none;
	}

	.bulk-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background-color: #f0f0ff;
		border: 1px solid #c7d2fe;
		border-radius: 6px;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.selected-count {
		font-size: 0.875rem;
		font-weight: 600;
		color: #4338ca;
	}

	.csv-errors {
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.csv-errors h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: #991b1b;
		margin: 0 0 0.5rem;
	}

	.csv-errors ul {
		margin: 0 0 0.75rem;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: #991b1b;
	}

	.csv-errors li {
		margin-bottom: 0.2rem;
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

	.select-all-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: #4b5563;
		cursor: pointer;
		white-space: nowrap;
	}

	:global(.clickable-row) {
		cursor: pointer;
	}

	:global(.selected-row) {
		background-color: #f5f3ff !important;
	}

	.checkbox-cell {
		width: 2rem;
	}

	.actions-cell {
		white-space: nowrap;
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

	.btn-inline {
		font-size: 0.75rem;
		padding: 0.2em 0.5em;
		border-radius: 4px;
		cursor: pointer;
		border: 1px solid transparent;
		font-weight: 500;
		transition: background-color 0.15s;
	}

	.btn-inline-danger {
		background-color: #fee2e2;
		color: #991b1b;
		border-color: #fecaca;
	}

	.btn-inline-danger:hover {
		background-color: #fecaca;
	}

	.btn-inline-restore {
		background-color: #d1fae5;
		color: #065f46;
		border-color: #a7f3d0;
	}

	.btn-inline-restore:hover {
		background-color: #a7f3d0;
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

	/* Custom CSV import confirmation dialog styles */
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

	.btn-cancel,
	.btn-confirm {
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

	.btn-confirm {
		background-color: #ef4444;
		color: #fff;
	}

	.btn-confirm:hover:not(:disabled) {
		background-color: #dc2626;
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
