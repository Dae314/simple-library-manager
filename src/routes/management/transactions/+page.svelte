<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { getContext, onMount } from 'svelte';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import toast from 'svelte-hot-french-toast';
	import { formatDateTime, formatWeight } from '$lib/utils/formatting.js';
	import { getPreferredPageSize, savePreferredPageSize } from '$lib/utils/page-size.js';

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
			weightUnit: string;
		};
	} = $props();

	let expandedTxId: number | null = $state(null);

	function toggleExpand(txId: number) {
		expandedTxId = expandedTxId === txId ? null : txId;
	}

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
		savePreferredPageSize(size);
		const url = new URL(window.location.href);
		url.searchParams.set('pageSize', String(size));
		url.searchParams.set('page', '1');
		goto(url.toString(), { replaceState: true });
	}

	// Apply stored page size preference when navigating to this page without an explicit pageSize param
	onMount(() => {
		const url = new URL(window.location.href);
		if (!url.searchParams.has('pageSize')) {
			const preferred = getPreferredPageSize();
			if (preferred !== data.transactions.pageSize) {
				url.searchParams.set('pageSize', String(preferred));
				url.searchParams.set('page', '1');
				goto(url.toString(), { replaceState: true });
			}
		}
	});

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
		<a href="/management" class="back-link" aria-label="Back to management">&larr; Management</a>
		<h1>Transaction Log <ConnectionIndicator connected={wsClient.connected} /></h1>
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
			<tr
				class="expandable-row"
				class:expanded={expandedTxId === tx.id}
				onclick={() => toggleExpand(tx.id)}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(tx.id); } }}
				aria-expanded={expandedTxId === tx.id}
			>
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
							<span class="note-indicator">📝</span>
						{/if}
					</span>
				</td>
				<td onclick={(e) => e.stopPropagation()}>
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
			{#if expandedTxId === tx.id}
				<tr class="detail-row">
					<td colspan={columns.length}>
						<div class="detail-panel">
							<div class="detail-grid">
								<div class="detail-item">
									<span class="detail-label">Transaction ID</span>
									<span class="detail-value">#{tx.id}</span>
								</div>
								<div class="detail-item">
									<span class="detail-label">Game</span>
									<span class="detail-value">{tx.gameTitle}</span>
								</div>
								<div class="detail-item">
									<span class="detail-label">Type</span>
									<span class="detail-value">{tx.type === 'checkout' ? 'Checkout' : 'Checkin'}{tx.isCorrection ? ' (Correction)' : ''}</span>
								</div>
								<div class="detail-item">
									<span class="detail-label">Time</span>
									<span class="detail-value">{formatDateTime(tx.createdAt)}</span>
								</div>
								{#if tx.attendeeFirstName || tx.attendeeLastName}
									<div class="detail-item">
										<span class="detail-label">Attendee</span>
										<span class="detail-value">{attendeeName(tx)}</span>
									</div>
								{/if}
								{#if tx.idType}
									<div class="detail-item">
										<span class="detail-label">ID Type</span>
										<span class="detail-value">{tx.idType}</span>
									</div>
								{/if}
								{#if tx.checkoutWeight != null}
									<div class="detail-item">
										<span class="detail-label">Checkout Weight</span>
										<span class="detail-value">{formatWeight(tx.checkoutWeight, data.weightUnit)}</span>
									</div>
								{/if}
								{#if tx.checkinWeight != null}
									<div class="detail-item">
										<span class="detail-label">Checkin Weight</span>
										<span class="detail-value">{formatWeight(tx.checkinWeight, data.weightUnit)}</span>
									</div>
								{/if}
								{#if tx.relatedTransactionId}
									<div class="detail-item">
										<span class="detail-label">Related Transaction</span>
										<span class="detail-value">#{tx.relatedTransactionId}</span>
									</div>
								{/if}
							</div>
							{#if tx.note}
								<div class="detail-note">
									<span class="detail-label">Note</span>
									<p class="detail-note-text">{tx.note}</p>
								</div>
							{/if}
						</div>
					</td>
				</tr>
			{/if}
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
		flex-direction: column;
		align-items: flex-start;
		margin-bottom: 1rem;
		gap: 0;
	}

	.back-link {
		display: inline-block;
		font-size: 0.85rem;
		color: #6366f1;
		text-decoration: none;
		margin-bottom: 0.5rem;
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

	.note-indicator {
		cursor: default;
		margin-left: 0.25rem;
	}

	.expandable-row {
		cursor: pointer;
	}

	.expandable-row:hover {
		background-color: #f3f4f6;
	}

	.expandable-row.expanded {
		background-color: #f0f0ff;
	}

	.detail-row {
		background-color: #fafafe;
	}

	.detail-row:hover {
		background-color: #fafafe !important;
	}

	.detail-panel {
		padding: 0.75rem 1rem;
		border-left: 3px solid #6366f1;
		margin: 0.25rem 0;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.6rem 1.5rem;
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.detail-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.detail-value {
		font-size: 0.85rem;
		color: #111827;
	}

	.detail-note {
		margin-top: 0.75rem;
		padding-top: 0.6rem;
		border-top: 1px solid #e5e7eb;
	}

	.detail-note-text {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: #374151;
		white-space: pre-wrap;
		word-break: break-word;
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

	@media (max-width: 640px) {	}
</style>
