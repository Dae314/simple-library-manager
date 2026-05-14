<script lang="ts">
	import { goto } from '$app/navigation';
	import BarChart from '$lib/components/BarChart.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import GameTypeBadge from '$lib/components/GameTypeBadge.svelte';
	import { formatDuration } from '$lib/utils/formatting.js';

	import type { StatisticsResult, TopAttendeeItem } from '$lib/server/services/statistics.js';

	type FilterValues = {
		timeRangeStart: string;
		timeRangeEnd: string;
		conventionDay: string;
		gameTitle: string;
		attendeeName: string;
		status: string;
		prizeType: string;
		groupByBgg: boolean;
		page: number;
		pageSize: number;
		sortField: string;
		sortDir: string;
	};

	let { data }: {
		data: {
			statistics: StatisticsResult;
			topAttendees: TopAttendeeItem[];
			conventionDays: { value: string; label: string }[];
			filters: FilterValues;
		};
	} = $props();

	let stats = $derived(data.statistics);
	let hasData = $derived(stats.totalCheckouts > 0 || stats.currentCheckedOut > 0 || stats.currentAvailable > 0);

	const filterConfigs = $derived([
		{ key: 'timeRangeStart', label: 'From Date', type: 'date' as const },
		{ key: 'timeRangeEnd', label: 'To Date', type: 'date' as const },
		...(data.conventionDays.length > 0
			? [{
				key: 'conventionDay', label: 'Convention Day', type: 'select' as const,
				options: data.conventionDays
			}]
			: []),
		{ key: 'gameTitle', label: 'Game Title', type: 'text' as const, placeholder: 'Search by title...' },
		{
			key: 'prizeType', label: 'Prize Type', type: 'select' as const,
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
		conventionDay: data.filters.conventionDay,
		gameTitle: data.filters.gameTitle,
		prizeType: data.filters.prizeType,
		groupByBgg: data.filters.groupByBgg
	});

	const topGamesColumns = [
		{ key: 'title', label: 'Title', sortField: 'title' },
		{ key: 'type', label: 'Type', sortField: 'game_type' },
		{ key: 'status', label: 'Status', sortField: 'status' },
		{ key: 'checkouts', label: 'Checkouts', sortField: 'checkouts' }
	];

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

	function statusLabel(status: string): string {
		switch (status) {
			case 'available': return 'Available';
			case 'checked_out': return 'Checked Out';
			case 'retired': return 'Retired';
			default: return status;
		}
	}

	let durationItems = $derived(
		stats.durationDistribution.map(b => ({ label: b.bucket, value: b.count }))
	);

	let timeItems = $derived(
		stats.timeDistribution.buckets.map(b => ({ label: b.label, value: b.count }))
	);

	let timeMaxLabels = $derived(
		stats.timeDistribution.granularity === 'hourly' ? 8
		: stats.timeDistribution.granularity === 'block' ? 7
		: 8
	);

	let timeChartTitle = $derived(
		stats.timeDistribution.granularity === 'hourly'
			? 'Checkouts by Hour'
			: stats.timeDistribution.granularity === 'block'
				? 'Checkouts by Period'
				: 'Checkouts by Day'
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
			<SortableTable
				columns={topGamesColumns}
				items={stats.topGames.items}
				totalItems={stats.topGames.total}
				currentPage={stats.topGames.page}
				pageSize={stats.topGames.pageSize}
				sortField={data.filters.sortField || null}
				sortDirection={data.filters.sortDir || null}
				emptyMessage="No game checkout data available."
				onSort={handleSort}
				onPageChange={handlePageChange}
				onPageSizeChange={handlePageSizeChange}
			>
				{#snippet row(game)}
					<tr>
						<td><span class="game-title">{game.title}</span></td>
						<td><GameTypeBadge prizeType={game.prizeType} /></td>
						<td>
							<span class="status-indicator {game.status}">
								{statusLabel(game.status)}
							</span>
						</td>
						<td class="checkout-count">{game.checkoutCount}</td>
					</tr>
				{/snippet}
			</SortableTable>
		</section>

		<section class="top-attendees" aria-label="Top attendees by checkouts">
			<h2>Attendees with Most Checkouts</h2>
			{#if data.topAttendees.length === 0}
				<p class="empty-message">No attendee checkout data available.</p>
			{:else}
				<table class="attendees-table">
					<thead>
						<tr>
							<th>Rank</th>
							<th>Name</th>
							<th>Checkouts</th>
						</tr>
					</thead>
					<tbody>
						{#each data.topAttendees as attendee, i}
							<tr>
								<td class="rank-cell">{i + 1}</td>
								<td><span class="attendee-name">{attendee.firstName} {attendee.lastName}</span></td>
								<td class="checkout-count">{attendee.checkoutCount}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="chart-section" aria-label="Checkouts over time">
			<h2>{timeChartTitle}</h2>
			<BarChart
				items={timeItems}
				direction="vertical"
				ariaLabel="Bar chart showing checkouts over time"
				emptyMessage="No checkout data to display."
				maxLabels={timeMaxLabels}
			/>
		</section>

		<section class="chart-section" aria-label="Duration distribution">
			<h2>Game Playtime</h2>
			<BarChart
				items={durationItems}
				direction="horizontal"
				ariaLabel="Bar chart showing checkout duration distribution"
				emptyMessage="No completed checkouts to display."
			/>
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

	.game-title {
		font-weight: 600;
		color: #111827;
	}

	.checkout-count {
		font-weight: 600;
		color: #6366f1;
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

	.chart-section {
		margin: 1.5rem 0;
	}

	.top-attendees {
		margin: 1.5rem 0;
	}

	.attendees-table {
		width: 100%;
		border-collapse: collapse;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
	}

	.attendees-table th {
		text-align: left;
		padding: 0.6rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #6b7280;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.attendees-table td {
		padding: 0.6rem 0.75rem;
		font-size: 0.875rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.attendees-table tr:last-child td {
		border-bottom: none;
	}

	.rank-cell {
		color: #6b7280;
		font-weight: 600;
		width: 3rem;
	}

	.attendee-name {
		font-weight: 600;
		color: #111827;
	}

	@media (max-width: 640px) {
		.metric-cards {
			grid-template-columns: repeat(2, 1fr);
		}

		.metric-card.wide {
			grid-column: span 2;
		}
	}
</style>
