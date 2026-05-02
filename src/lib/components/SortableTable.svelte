<script lang="ts">
	import type { Snippet } from 'svelte';
	import Pagination from './Pagination.svelte';

	interface FilterOption {
		value: string;
		label: string;
	}

	interface FilterConfig {
		key: string;
		label: string;
		type: 'text' | 'select' | 'date' | 'toggle';
		options?: FilterOption[];
		placeholder?: string;
	}

	interface ColumnDef {
		key: string;
		label: string;
		sortField?: string;
		srOnly?: boolean;
	}

	let {
		columns,
		items,
		totalItems,
		currentPage,
		pageSize,
		sortField = null,
		sortDirection = null,
		filters = [],
		filterValues = {},
		emptyMessage = 'No results found.',
		onSort,
		onFilterChange,
		onPageChange,
		onPageSizeChange,
		row,
		headerActions,
		aboveTable
	}: {
		columns: ColumnDef[];
		items: any[];
		totalItems: number;
		currentPage: number;
		pageSize: number;
		sortField?: string | null;
		sortDirection?: string | null;
		filters?: FilterConfig[];
		filterValues?: Record<string, any>;
		emptyMessage?: string;
		onSort: (field: string, direction: 'asc' | 'desc') => void;
		onFilterChange?: (values: Record<string, any>) => void;
		onPageChange: (page: number) => void;
		onPageSizeChange: (size: number) => void;
		row: Snippet<[any, number]>;
		headerActions?: Snippet;
		aboveTable?: Snippet;
	} = $props();

	// Local copy of filter values that updates immediately on user interaction,
	// preventing Svelte from resetting controlled inputs before navigation completes.
	// svelte-ignore state_referenced_locally
	let localFilterValues: Record<string, any> = $state({ ...filterValues });

	// Sync from parent prop when server data changes (e.g. after navigation).
	// We track the previous prop reference to avoid overwriting local edits on every render.
	// svelte-ignore state_referenced_locally
	let prevFilterValues = filterValues;
	$effect(() => {
		if (filterValues !== prevFilterValues) {
			prevFilterValues = filterValues;
			localFilterValues = { ...filterValues };
		}
	});

	function handleSort(field: string) {
		if (sortField === field && sortDirection === 'asc') {
			onSort(field, 'desc');
		} else {
			onSort(field, 'asc');
		}
	}

	function handleFilterInput(key: string, value: any) {
		localFilterValues[key] = value;
		onFilterChange?.({ ...localFilterValues });
	}

	let searchTimers: Record<string, ReturnType<typeof setTimeout>> = {};

	function handleDebouncedInput(key: string) {
		if (searchTimers[key]) clearTimeout(searchTimers[key]);
		searchTimers[key] = setTimeout(() => {
			onFilterChange?.({ ...localFilterValues });
		}, 300);
	}
</script>

{#if filters.length > 0}
	<fieldset class="filter-bar">
		<legend class="sr-only">Filters</legend>
		<div class="filter-row">
			{#each filters as filter (filter.key)}
				<div class="filter-field" class:filter-text={filter.type === 'text'} class:filter-toggle={filter.type === 'toggle'}>
					{#if filter.type === 'text'}
						<input
							type="search"
							id="filter-{filter.key}"
							aria-label={filter.label}
							placeholder={filter.placeholder ?? filter.label}
							bind:value={localFilterValues[filter.key]}
							oninput={() => handleDebouncedInput(filter.key)}
						/>
					{:else if filter.type === 'select'}
						<select
							id="filter-{filter.key}"
							aria-label={filter.label}
							value={localFilterValues[filter.key] ?? ''}
							onchange={(e) => handleFilterInput(filter.key, (e.target as HTMLSelectElement).value)}
						>
							<option value="">{filter.label}: All</option>
							{#each filter.options ?? [] as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					{:else if filter.type === 'date'}
						<label class="date-label" for="filter-{filter.key}">{filter.label}</label>
						<input
							id="filter-{filter.key}"
							type="date"
							value={localFilterValues[filter.key] ?? ''}
							onchange={(e) => handleFilterInput(filter.key, (e.target as HTMLInputElement).value)}
						/>
					{:else if filter.type === 'toggle'}
						<label class="toggle-label" for="filter-{filter.key}">
							<input
								id="filter-{filter.key}"
								type="checkbox"
								class="toggle-input"
								checked={localFilterValues[filter.key] ?? false}
								onchange={(e) => handleFilterInput(filter.key, (e.target as HTMLInputElement).checked)}
							/>
							<span class="toggle-track">
								<span class="toggle-thumb"></span>
							</span>
							<span class="toggle-text">{filter.label}</span>
						</label>
					{/if}
				</div>
			{/each}
			{#if headerActions}
				<div class="filter-actions">
					{@render headerActions()}
				</div>
			{/if}
		</div>
	</fieldset>
{/if}

{#if aboveTable}
	{@render aboveTable()}
{/if}

{#if items.length === 0}
	<p class="empty-message">{emptyMessage}</p>
{:else}
	<div class="table-wrapper">
		<table>
			<thead>
				<tr>
					{#each columns as col (col.key)}
						<th
							class:sr-only-header={col.srOnly}
							aria-sort={col.sortField && sortField === col.sortField ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
						>
							{#if col.sortField}
								<button
									class="sort-btn"
									class:active={sortField === col.sortField}
									onclick={() => handleSort(col.sortField!)}
								>
									{col.label}
									<span class="sort-icon" aria-hidden="true">
										{#if sortField === col.sortField && sortDirection === 'asc'}
											▲
										{:else if sortField === col.sortField && sortDirection === 'desc'}
											▼
										{:else}
											⇅
										{/if}
									</span>
								</button>
							{:else}
								{#if col.srOnly}
									<span class="sr-only">{col.label}</span>
								{:else}
									{col.label}
								{/if}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each items as item, index (item.id ?? index)}
					{@render row(item, index)}
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<Pagination
	{totalItems}
	{currentPage}
	{pageSize}
	{onPageChange}
	{onPageSizeChange}
/>

<style>
	/* --- Filter bar --- */
	.filter-bar {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		background-color: #fafafa;
		margin-bottom: 1rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
	}

	.filter-field {
		flex: 0 0 auto;
	}

	.filter-text {
		flex: 1 1 200px;
		min-width: 160px;
	}

	.filter-field input[type='search'],
	.filter-field select,
	.filter-field input[type='date'] {
		padding: 0.4rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.875rem;
		background: #fff;
		outline: none;
		transition: border-color 0.15s;
	}

	.filter-field input[type='search'] {
		width: 100%;
	}

	.filter-field input[type='search']:focus,
	.filter-field select:focus,
	.filter-field input[type='date']:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.date-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #6b7280;
		margin-right: 0.3rem;
	}

	.toggle-label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-size: 0.85rem;
		color: #4b5563;
	}

	.toggle-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-track {
		position: relative;
		display: inline-block;
		width: 36px;
		height: 20px;
		background-color: #d1d5db;
		border-radius: 10px;
		transition: background-color 0.2s;
		flex-shrink: 0;
	}

	.toggle-input:checked + .toggle-track {
		background-color: #6366f1;
	}

	.toggle-input:focus-visible + .toggle-track {
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		background-color: #fff;
		border-radius: 50%;
		transition: transform 0.2s;
	}

	.toggle-input:checked + .toggle-track .toggle-thumb {
		transform: translateX(16px);
	}

	.toggle-text {
		white-space: nowrap;
	}

	.filter-actions {
		margin-left: auto;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	/* --- Table --- */
	.table-wrapper {
		overflow-x: auto;
		margin-bottom: 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	thead {
		background-color: #f9fafb;
		border-bottom: 2px solid #e5e7eb;
	}

	th {
		padding: 0.6rem 0.75rem;
		text-align: left;
		font-size: 0.78rem;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		white-space: nowrap;
	}

	.sr-only-header {
		width: 1px;
		padding: 0;
		overflow: hidden;
	}

	:global(tbody tr) {
		border-bottom: 1px solid #f3f4f6;
		transition: background-color 0.1s;
	}

	:global(tbody tr:last-child) {
		border-bottom: none;
	}

	:global(tbody tr:hover) {
		background-color: #f9fafb;
	}

	:global(tbody td) {
		padding: 0.6rem 0.75rem;
		color: #374151;
		vertical-align: middle;
	}

	/* --- Sort button --- */
	.sort-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
		font-weight: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.15s;
	}

	.sort-btn:hover {
		color: #6366f1;
	}

	.sort-btn.active {
		color: #6366f1;
	}

	.sort-icon {
		font-size: 0.7rem;
		line-height: 1;
	}

	/* --- Empty state --- */
	.empty-message {
		color: #6b7280;
		font-size: 0.9rem;
		padding: 2rem 0;
		text-align: center;
	}

	@media (max-width: 640px) {
		.filter-row {
			flex-direction: column;
			align-items: stretch;
		}

		.filter-text {
			min-width: 100%;
		}

		.filter-actions {
			margin-left: 0;
			width: 100%;
		}
	}
</style>
