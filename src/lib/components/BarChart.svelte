<script lang="ts">
	interface BarItem {
		label: string;
		value: number;
	}

	let {
		items,
		direction = 'horizontal',
		ariaLabel = 'Bar chart',
		emptyMessage = 'No data to display.',
		height = 180,
		maxLabels = 0
	}: {
		items: BarItem[];
		direction?: 'horizontal' | 'vertical';
		ariaLabel?: string;
		emptyMessage?: string;
		height?: number;
		maxLabels?: number;
	} = $props();

	let maxValue = $derived(Math.max(...items.map(i => i.value), 0));
	let hasData = $derived(items.some(i => i.value > 0));

	/**
	 * Compute which label indices to show. When maxLabels is set and the item count
	 * exceeds it, we space labels evenly across the axis, always including the first
	 * and last items.
	 */
	let visibleLabelIndices = $derived.by(() => {
		const total = items.length;
		if (maxLabels <= 0 || total <= maxLabels) {
			return new Set(items.map((_, i) => i));
		}
		const indices = new Set<number>();
		indices.add(0);
		indices.add(total - 1);
		const step = (total - 1) / (maxLabels - 1);
		for (let i = 1; i < maxLabels - 1; i++) {
			indices.add(Math.round(step * i));
		}
		return indices;
	});
</script>

{#if !hasData}
	<p class="empty-message">{emptyMessage}</p>
{:else if direction === 'horizontal'}
	<div class="horizontal-bars" role="img" aria-label={ariaLabel}>
		{#each items as item (item.label)}
			<div class="bar-row">
				<span class="bar-label">{item.label}</span>
				<div class="bar-track">
					<div
						class="bar-fill"
						style="width: {maxValue > 0 ? (item.value / maxValue) * 100 : 0}%"
						role="meter"
						aria-valuenow={item.value}
						aria-valuemin={0}
						aria-valuemax={maxValue}
						aria-label="{item.label}: {item.value}"
					></div>
				</div>
				<span class="bar-count">{item.value}</span>
			</div>
		{/each}
	</div>
{:else}
	<div class="vertical-chart" role="img" aria-label={ariaLabel}>
		<div class="chart-bars" style="height: {height}px">
			{#each items as item, idx (item.label)}
				<div class="chart-column">
					<span class="column-count" class:hidden={item.value === 0}>{item.value}</span>
					<div
						class="column-bar"
						style="height: {maxValue > 0 ? (item.value / maxValue) * 100 : 0}%"
						role="meter"
						aria-valuenow={item.value}
						aria-valuemin={0}
						aria-valuemax={maxValue}
						aria-label="{item.label}: {item.value}"
					></div>
					<span class="column-label" class:column-label-hidden={!visibleLabelIndices.has(idx)}>{item.label}</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.empty-message {
		color: #6b7280;
		font-size: 0.9rem;
		padding: 2rem 0;
		text-align: center;
	}

	/* Horizontal bars */
	.horizontal-bars {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.bar-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.bar-label {
		min-width: 130px;
		font-size: 0.85rem;
		color: #4b5563;
		text-align: right;
	}

	.bar-track {
		flex: 1;
		height: 24px;
		background: #f3f4f6;
		border-radius: 4px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		background: #6366f1;
		border-radius: 4px;
		transition: width 0.3s ease;
		min-width: 2px;
	}

	.bar-count {
		min-width: 2rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #374151;
	}

	/* Vertical columns */
	.vertical-chart {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1.25rem 1rem 0.75rem;
		overflow-x: auto;
	}

	.chart-bars {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		min-width: 500px;
	}

	.chart-column {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		justify-content: flex-end;
	}

	.column-count {
		font-size: 0.7rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 2px;
	}

	.column-count.hidden {
		visibility: hidden;
	}

	.column-bar {
		width: 100%;
		max-width: 28px;
		background: #6366f1;
		border-radius: 3px 3px 0 0;
		transition: height 0.3s ease;
		min-height: 2px;
	}

	.column-label {
		font-size: 0.65rem;
		color: #6b7280;
		margin-top: 4px;
		white-space: nowrap;
	}

	.column-label-hidden {
		visibility: hidden;
	}

	@media (max-width: 640px) {
		.bar-label {
			min-width: 90px;
			font-size: 0.75rem;
		}
	}
</style>
