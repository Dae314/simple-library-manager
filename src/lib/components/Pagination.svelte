<script lang="ts">
	let {
		totalItems,
		currentPage,
		pageSize,
		pageSizeOptions = [10, 25, 50],
		onPageChange,
		onPageSizeChange
	}: {
		totalItems: number;
		currentPage: number;
		pageSize: number;
		pageSizeOptions?: number[];
		onPageChange: (page: number) => void;
		onPageSizeChange: (size: number) => void;
	} = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(totalItems / pageSize)));
	const isFirstPage = $derived(currentPage <= 1);
	const isLastPage = $derived(currentPage >= totalPages);

	const visiblePages = $derived.by(() => {
		const pages: number[] = [];
		const start = Math.max(1, currentPage - 2);
		const end = Math.min(totalPages, currentPage + 2);
		for (let i = start; i <= end; i++) {
			pages.push(i);
		}
		return pages;
	});

	function handlePageSizeChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		onPageSizeChange(Number(select.value));
	}
</script>

<nav aria-label="Pagination" class="pagination">
	<span class="total">{totalItems} result{totalItems !== 1 ? 's' : ''}</span>

	<div class="page-controls">
		<button disabled={isFirstPage} onclick={() => onPageChange(currentPage - 1)} aria-label="Previous page">
			← Prev
		</button>

		{#each visiblePages as p (p)}
			<button
				class="page-btn"
				class:active={p === currentPage}
				aria-current={p === currentPage ? 'page' : undefined}
				onclick={() => onPageChange(p)}
			>
				{p}
			</button>
		{/each}

		<button disabled={isLastPage} onclick={() => onPageChange(currentPage + 1)} aria-label="Next page">
			Next →
		</button>
	</div>

	<div class="page-size">
		<label>
			Per page:
			<select value={String(pageSize)} onchange={handlePageSizeChange}>
				{#each pageSizeOptions as opt (opt)}
					<option value={String(opt)}>{opt}</option>
				{/each}
			</select>
		</label>
	</div>
</nav>

<style>
	.pagination {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.875rem;
		padding: 0.5rem 0;
	}

	.total {
		color: #6b7280;
		white-space: nowrap;
	}

	.page-controls {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	button {
		padding: 0.3rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: #fff;
		cursor: pointer;
		font-size: 0.8rem;
		color: #374151;
		transition: background-color 0.15s;
	}

	button:hover:not(:disabled) {
		background-color: #f3f4f6;
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.page-btn.active {
		background-color: #6366f1;
		color: #fff;
		border-color: #6366f1;
	}

	.page-size label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #6b7280;
		white-space: nowrap;
	}

	select {
		padding: 0.25rem 0.4rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		font-size: 0.8rem;
		background: #fff;
	}
</style>
