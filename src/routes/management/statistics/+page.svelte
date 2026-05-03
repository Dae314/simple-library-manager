<script lang="ts">
	import { goto } from '$app/navigation';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { formatDuration } from '$lib/utils/formatting.js';

	import type { StatisticsResult } from '$lib/server/services/statistics.js';

	type FilterValues = {
		timeRangeStart: string;
		timeRangeEnd: string;
		timeOfDay: string;
		conventionDay: string;
		gameTitle: string;
		attendeeName: string;
		status: string;
		gameType: string;
		groupByBgg: boolean;
		page: number;
		pageSize: number;
	};

	let { data }: {
		data: {
			statistics: StatisticsResult;
			conventionDays: { value: string; label: string }[];
			filters: FilterValues;
		};
	} = $props();

	let stats = $derived(data.statistics);
	let hasData = $derived(stats.totalCheckouts > 0 || stats.currentCheckedOut > 0 || stats.currentAvailable > 0);

	const filterConfigs = $derived([
		{ key: 'timeRangeStart', label: 'From Date', type: 'date' as const },
		{ key: 'timeRangeEnd', label: 'To Date', type: 'date' as const },
		{
			key: 'timeOfDay', label: 'Time of Day', type: 'select' as const,
			options: [
				{ value: 'morning', label: 'Morning (8am–12pm)' },
				{ value: 'afternoon', label: 'Afternoon (12pm–5pm)' },
				{ value: 'evening', label: 'Evening (5pm–10pm)' }
			]
		},
		...(data.conventionDays.length > 0
			? [{
				key: 'conventionDay', label: 'Convention Day', type: 'select' as const,
				options: data.conventionDays
			}]
			: []),
		{ key: 'gameTitle', label: 'Game Title', type: 'text' as const, placeholder: 'Search by title...' },
		{ key: 'attendeeName', label: 'Attendee Name', type: 'text' as const, placeholder: 'Search by name...' },
		{
			key: 'status', label: 'Availability Status', type: 'select' as const,
			options: [
				{ value: 'available', label: 'Available' },
				{ value: 'checked_out', label: 'Checked Out' }
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
		{ key: 'groupByBgg', label: 'Group by BGG Title', type: 'toggle' as const }
	]);

	let filterValues = $derived({
		timeRangeStart: data.filters.timeRangeStart,
		timeRangeEnd: data.filters.timeRangeEnd,
		timeOfDay: data.filters.timeOfDay,
		conventionDay: data.filters.conventionDay,
		gameTitle: data.filters.gameTitle,
		attendeeName: data.filters.attendeeName,
		status: data.filters.status,
		gameType: data.filters.gameType,
		groupByBgg: data.filters.groupByBgg
	});

	function durationMs(d: { hours: number; minutes: number; totalMinutes: number }): number {
		return d.totalMinutes * 60_000;
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

	let maxDistributionCount = $derived(
		Math.max(...stats.durationDistribution.map(b => b.count), 0)
	);
</script>

<div class="statistics-page">
	<a href="/management" class="back-link" aria-label="Back to management">&larr; Management</a>
	<h1>Statistics</h1>

	<FilterPanel
		filters={filterConfigs}
		values={filterValues}
		onChange={handleFilterChange}
	/>

	{#if !hasData}
		<p class="empty-message">No matching data found.</p>
	{:else}
		<section class="metric-cards" aria-label="Key metrics">
			<div class="metric-card">
				<span class="metric-value">{stats.totalCheckouts}</span>
				<span class="metric-label">Total Checkouts</span>
			</div>
			<div class="metric-card">
				<span class="metric-value">{stats.currentCheckedOut}</span>
				<span class="metric-label">Currently Checked Out</span>
			</div>
			<div class="metric-card">
				<span class="metric-value">{stats.currentAvailable}</span>
				<span class="metric-label">Currently Available</span>
			</div>
			<div class="metric-card">
				<span class="metric-value">{stats.avgCheckoutsPerDay}</span>
				<span class="metric-label">Avg Checkouts / Day</span>
			</div>
			<div class="metric-card">
				<span class="metric-value">{formatDuration(durationMs(stats.avgCheckoutDuration))}</span>
				<span class="metric-label">Avg Duration</span>
			</div>
			<div class="metric-card">
				<span class="metric-value">{formatDuration(durationMs(stats.minCheckoutDuration))}</span>
				<span class="metric-label">Min Duration</span>
			</div>
			<div class="metric-card">
				<span class="metric-value">{formatDuration(durationMs(stats.maxCheckoutDuration))}</span>
				<span class="metric-label">Max Duration</span>
			</div>
			{#if stats.longestCumulativeGame}
				<div class="metric-card wide">
					<span class="metric-value">{stats.longestCumulativeGame.title}</span>
					<span class="metric-label">
						Longest Cumulative — {formatDuration(durationMs(stats.longestCumulativeGame.totalDuration))}
					</span>
				</div>
			{/if}
		</section>

		<section class="top-games" aria-label="Top games by checkouts">
			<h2>Top Games</h2>
			{#if stats.topGames.items.length === 0}
				<p class="empty-message">No game checkout data available.</p>
			{:else}
				<ol class="ranked-list">
					{#each stats.topGames.items as game, i (game.title)}
						<li class="ranked-item">
							<span class="rank">#{(stats.topGames.page - 1) * stats.topGames.pageSize + i + 1}</span>
							<span class="game-title">{game.title}</span>
							<span class="checkout-count">{game.checkoutCount} checkout{game.checkoutCount !== 1 ? 's' : ''}</span>
						</li>
					{/each}
				</ol>
			{/if}

			<Pagination
				totalItems={stats.topGames.total}
				currentPage={stats.topGames.page}
				pageSize={stats.topGames.pageSize}
				onPageChange={handlePageChange}
				onPageSizeChange={handlePageSizeChange}
			/>
		</section>

		<section class="duration-distribution" aria-label="Duration distribution">
			<h2>Duration Distribution</h2>
			{#if stats.durationDistribution.every(b => b.count === 0)}
				<p class="empty-message">No completed checkouts to display.</p>
			{:else}
				<div class="distribution-bars">
					{#each stats.durationDistribution as bucket (bucket.bucket)}
						<div class="bar-row">
							<span class="bar-label">{bucket.bucket}</span>
							<div class="bar-track">
								<div
									class="bar-fill"
									style="width: {maxDistributionCount > 0 ? (bucket.count / maxDistributionCount) * 100 : 0}%"
									role="meter"
									aria-valuenow={bucket.count}
									aria-valuemin={0}
									aria-valuemax={maxDistributionCount}
									aria-label="{bucket.bucket}: {bucket.count}"
								></div>
							</div>
							<span class="bar-count">{bucket.count}</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.statistics-page {
		max-width: 960px;
		margin: 0 auto;
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
		margin: 0 0 1rem;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		color: #1f2937;
		margin: 0 0 0.75rem;
	}

	.empty-message {
		color: #6b7280;
		font-size: 0.9rem;
		padding: 2rem 0;
		text-align: center;
	}

	.metric-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
		margin: 1.25rem 0;
	}

	.metric-card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.metric-card.wide {
		grid-column: span 2;
	}

	.metric-value {
		font-size: 1.35rem;
		font-weight: 700;
		color: #111827;
	}

	.metric-label {
		font-size: 0.8rem;
		color: #6b7280;
	}

	.top-games {
		margin: 1.5rem 0;
	}

	.ranked-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.ranked-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
	}

	.rank {
		font-weight: 700;
		color: #6366f1;
		min-width: 2rem;
		font-size: 0.9rem;
	}

	.game-title {
		flex: 1;
		font-weight: 500;
		color: #1f2937;
	}

	.checkout-count {
		font-size: 0.85rem;
		color: #6b7280;
		white-space: nowrap;
	}

	.duration-distribution {
		margin: 1.5rem 0;
	}

	.distribution-bars {
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

	@media (max-width: 640px) {
		.metric-cards {
			grid-template-columns: repeat(2, 1fr);
		}

		.metric-card.wide {
			grid-column: span 2;
		}

		.bar-label {
			min-width: 90px;
			font-size: 0.75rem;
		}
	}
</style>
