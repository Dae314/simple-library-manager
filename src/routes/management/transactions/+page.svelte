<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { getContext } from 'svelte';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import toast from 'svelte-hot-french-toast';
	import { formatDateTime, formatWeight } from '$lib/utils/formatting.js';

	const wsClient: { connected: boolean } = getContext('ws');

	type TransactionWithGame = {
		id: number;
		gameId: number;
		type: string;
		attendeeFirstName: string | null;
		attendeeLastName: string | null;
		idType: string | null;
		checkoutWeight: number | null;
		checkinWeight: number | null;
		note: string | null;
		isCorrection: boolean;
		relatedTransactionId: number | null;
		createdAt: Date;
		gameTitle: string;
	};

	type PaginatedResult = {
		items: TransactionWithGame[];
		total: number;
		page: number;
		pageSize: number;
	};

	type FilterValues = {
		gameTitle: string;
		type: string;
		attendeeName: string;
		page: number;
		pageSize: number;
	};

	let { data }: {
		data: {
			transactions: PaginatedResult;
			filters: FilterValues;
			sortField: string;
			sortDir: string;
		};
	} = $props();

	const columns = [
		{ key: 'time', label: 'Time', sortField: 'created_at' },
		{ key: 'game', label: 'Game', sortField: 'game_title' },
		{ key: 'type', label: 'Type', sortField: 'type' },
		{ key: 'attendee', label: 'Attendee', sortField: 'attendee' },
		{ key: 'details', label: 'Details' },
		{ key: 'actions', label: 'Actions', srOnly: true }
	];

	const filterConfigs = [
		{ key: 'gameTitle', label: 'Game Title', type: 'text' as const, placeholder: 'Search by game title...' },
		{
			key: 'type', label: 'Type', type: 'select' as const,
			options: [
				{ value: 'checkout', label: 'Checkout' },
				{ value: 'checkin', label: 'Checkin' }
			]
		},
		{ key: 'attendeeName', label: 'Attendee', type: 'text' as const, placeholder: 'Search by attendee...' }
	];

	let filterValues = $derived({
		gameTitle: data.filters.gameTitle,
		type: data.filters.type,
		attendeeName: data.filters.attendeeName
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

	function attendeeName(tx: TransactionWithGame): string {
		const parts = [tx.attendeeFirstName, tx.attendeeLastName].filter(Boolean);
		return parts.length > 0 ? parts.join(' ') : '';
	}

	function txDetails(tx: TransactionWithGame): string {
		const parts: string[] = [];
		if (tx.checkoutWeight != null) parts.push(`Out: ${formatWeight(tx.checkoutWeight)}`);
		if (tx.checkinWeight != null) parts.push(`In: ${formatWeight(tx.checkinWeight)}`);
		return parts.join(' · ');
	}
</script>

<div class="transactions-page">
	<div class="page-header">
		<h1>Transaction Log <ConnectionIndicator connected={wsClient.connected} /></h1>
		<a href="/management" class="btn btn-secondary">← Back to Management</a>
	</div>

	<SortableTable
		{columns}
		items={data.transactions.items}
		totalItems={data.transactions.total}
		currentPage={data.transactions.page}
		pageSize={data.transactions.pageSize}
		sortField={data.sortField}
		sortDirection={data.sortDir}
		filters={filterConfigs}
		{filterValues}
		emptyMessage="No transactions found matching your filters."
		onSort={handleSort}
		onFilterChange={handleFilterChange}
		onPageChange={handlePageChange}
		onPageSizeChange={handlePageSizeChange}
	>
		{#snippet row(tx)}
			<tr>
				<td class="timestamp">{formatDateTime(tx.createdAt)}</td>
				<td>
					<span class="game-title">{tx.gameTitle}</span>
				</td>
				<td>
					<span class="type-badge" class:checkout={tx.type === 'checkout'} class:checkin={tx.type === 'checkin'}>
						{tx.type === 'checkout' ? 'Checkout' : 'Checkin'}
					</span>
					{#if tx.isCorrection}
						<span class="correction-badge">Correction</span>
					{/if}
				</td>
				<td>{attendeeName(tx)}</td>
				<td>
					<span class="details-text">
						{txDetails(tx)}
						{#if tx.note}
							<span class="note" title={tx.note}>📝 {tx.note}</span>
						{/if}
					</span>
				</td>
				<td>
					{#if !tx.isCorrection}
						{#if tx.type === 'checkout'}
							<form method="POST" action="?/reverseCheckout" use:enhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										toast.success('Checkout reversed successfully');
									} else if (result.type === 'failure') {
										const msg = (result.data as any)?.error || 'Failed to reverse checkout';
										toast.error(msg);
									}
									await update();
								};
							}}>
								<input type="hidden" name="transactionId" value={tx.id} />
								<button type="submit" class="btn-reverse">Reverse</button>
							</form>
						{:else if tx.type === 'checkin'}
							<form method="POST" action="?/reverseCheckin" use:enhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										toast.success('Checkin reversed successfully');
									} else if (result.type === 'failure') {
										const msg = (result.data as any)?.error || 'Failed to reverse checkin';
										toast.error(msg);
									}
									await update();
								};
							}}>
								<input type="hidden" name="transactionId" value={tx.id} />
								<button type="submit" class="btn-reverse">Reverse</button>
							</form>
						{/if}
					{/if}
				</td>
			</tr>
		{/snippet}
	</SortableTable>
</div>

<style>
	.transactions-page {
		max-width: 1100px;
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

	.btn {
		display: inline-block;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background-color 0.15s;
	}

	.btn-secondary {
		background-color: #f3f4f6;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-secondary:hover {
		background-color: #e5e7eb;
	}

	.timestamp {
		color: #6b7280;
		font-size: 0.82rem;
		white-space: nowrap;
	}

	.game-title {
		font-weight: 600;
		color: #111827;
	}

	.type-badge {
		display: inline-block;
		padding: 0.15em 0.5em;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.type-badge.checkout {
		background-color: #dbeafe;
		color: #1e40af;
	}

	.type-badge.checkin {
		background-color: #d1fae5;
		color: #065f46;
	}

	.correction-badge {
		display: inline-block;
		padding: 0.15em 0.5em;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		background-color: #fef3c7;
		color: #92400e;
		margin-left: 0.25rem;
	}

	.details-text {
		font-size: 0.82rem;
		color: #4b5563;
	}

	.note {
		display: block;
		font-style: italic;
		color: #6b7280;
		font-size: 0.8rem;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.btn-reverse {
		background-color: #fef3c7;
		color: #92400e;
		border: 1px solid #f59e0b;
		padding: 0.25rem 0.6rem;
		border-radius: 6px;
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
		white-space: nowrap;
	}

	.btn-reverse:hover {
		background-color: #fde68a;
	}

	@media (max-width: 640px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
