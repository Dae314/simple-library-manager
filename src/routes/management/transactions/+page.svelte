<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/Pagination.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import toast from 'svelte-hot-french-toast';
	import { formatDateTime, formatWeight } from '$lib/utils/formatting.js';

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
		};
	} = $props();

	const filterConfigs = [
		{ key: 'gameTitle', label: 'Game Title', type: 'text' as const, placeholder: 'Search by game title...' },
		{
			key: 'type', label: 'Transaction Type', type: 'select' as const,
			options: [
				{ value: 'checkout', label: 'Checkout' },
				{ value: 'checkin', label: 'Checkin' }
			]
		},
		{ key: 'attendeeName', label: 'Attendee Name', type: 'text' as const, placeholder: 'Search by attendee...' }
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
</script>

<div class="transactions-page">
	<div class="page-header">
		<h1>Transaction Log</h1>
		<a href="/management" class="btn btn-secondary">← Back to Management</a>
	</div>

	<FilterPanel
		filters={filterConfigs}
		values={filterValues}
		onChange={handleFilterChange}
	/>

	{#if data.transactions.items.length === 0}
		<p class="empty-message">No transactions found matching your filters.</p>
	{:else}
		<div class="transaction-list">
			{#each data.transactions.items as tx (tx.id)}
				<div class="transaction-card">
					<div class="card-header">
						<span class="game-title">{tx.gameTitle}</span>
						<span class="type-badge" class:checkout={tx.type === 'checkout'} class:checkin={tx.type === 'checkin'}>
							{tx.type === 'checkout' ? 'Checkout' : 'Checkin'}
						</span>
						{#if tx.isCorrection}
							<span class="correction-badge">Correction</span>
						{/if}
					</div>

					<div class="card-body">
						<div class="card-details">
							<span class="timestamp">{formatDateTime(tx.createdAt)}</span>
							{#if attendeeName(tx)}
								<span class="detail-item">
									<span class="detail-label">Attendee:</span> {attendeeName(tx)}
								</span>
							{/if}
							{#if tx.checkoutWeight != null}
								<span class="detail-item">
									<span class="detail-label">Checkout weight:</span> {formatWeight(tx.checkoutWeight)}
								</span>
							{/if}
							{#if tx.checkinWeight != null}
								<span class="detail-item">
									<span class="detail-label">Checkin weight:</span> {formatWeight(tx.checkinWeight)}
								</span>
							{/if}
							{#if tx.note}
								<span class="detail-item note">
									<span class="detail-label">Note:</span> {tx.note}
								</span>
							{/if}
						</div>

						{#if !tx.isCorrection}
							<div class="card-actions">
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
										<button type="submit" class="btn btn-reverse">Reverse Checkout</button>
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
										<button type="submit" class="btn btn-reverse">Reverse Checkin</button>
									</form>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<Pagination
		totalItems={data.transactions.total}
		currentPage={data.transactions.page}
		pageSize={data.transactions.pageSize}
		onPageChange={handlePageChange}
		onPageSizeChange={handlePageSizeChange}
	/>
</div>

<style>
	.transactions-page {
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

	.btn-reverse {
		background-color: #fef3c7;
		color: #92400e;
		border: 1px solid #f59e0b;
		padding: 0.3rem 0.7rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-reverse:hover {
		background-color: #fde68a;
	}

	.empty-message {
		color: #6b7280;
		font-size: 0.9rem;
		padding: 2rem 0;
		text-align: center;
	}

	.transaction-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
	}

	.transaction-card {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		background: #fff;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}

	.game-title {
		font-weight: 600;
		color: #111827;
		font-size: 0.95rem;
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
	}

	.card-body {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.card-details {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		font-size: 0.85rem;
		color: #4b5563;
	}

	.timestamp {
		color: #6b7280;
		font-size: 0.8rem;
	}

	.detail-item {
		white-space: nowrap;
	}

	.detail-item.note {
		white-space: normal;
		flex-basis: 100%;
		font-style: italic;
		color: #6b7280;
	}

	.detail-label {
		font-weight: 600;
		color: #374151;
	}

	.card-actions {
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.card-body {
			flex-direction: column;
		}

		.card-actions {
			width: 100%;
		}

		.btn-reverse {
			width: 100%;
			text-align: center;
		}
	}
</style>
