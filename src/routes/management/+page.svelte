<script lang="ts">
	let { data }: {
		data: {
			counts: {
				total: number;
				available: number;
				checkedOut: number;
				retired: number;
			};
		};
	} = $props();
</script>

<div class="management-landing">
	<h1>Management</h1>

	<div class="summary-bar">
		<div class="stat">
			<span class="stat-value">{data.counts.total}</span>
			<span class="stat-label">Total Games</span>
		</div>
		<div class="stat">
			<span class="stat-value available">{data.counts.available}</span>
			<span class="stat-label">Available</span>
		</div>
		<div class="stat">
			<span class="stat-value checked-out">{data.counts.checkedOut}</span>
			<span class="stat-label">Checked Out</span>
		</div>
		<div class="stat">
			<span class="stat-value retired">{data.counts.retired}</span>
			<span class="stat-label">Retired</span>
		</div>
	</div>

	<nav class="nav-cards" aria-label="Management sections">
		<a href="/management/games" class="nav-card">
			<span class="card-icon" aria-hidden="true">🎲</span>
			<span class="card-title">Games</span>
			<span class="card-desc">Add, edit, retire, and restore games. Bulk operations and CSV import/export.</span>
		</a>
		<a href="/management/transactions" class="nav-card">
			<span class="card-icon" aria-hidden="true">📋</span>
			<span class="card-title">Transactions</span>
			<span class="card-desc">View checkout and checkin history. Reverse erroneous transactions.</span>
		</a>
		<a href="/management/config" class="nav-card">
			<span class="card-icon" aria-hidden="true">⚙️</span>
			<span class="card-title">Configuration</span>
			<span class="card-desc">Convention name, dates, weight tolerance, weight unit, and ID types.</span>
		</a>
		<a href="/management/backup" class="nav-card">
			<span class="card-icon" aria-hidden="true">💾</span>
			<span class="card-title">Backup</span>
			<span class="card-desc">Export or import a full database backup.</span>
		</a>
		<a href="/management/statistics" class="nav-card">
			<span class="card-icon" aria-hidden="true">📊</span>
			<span class="card-title">Statistics</span>
			<span class="card-desc">Checkout metrics, top games, duration distribution, and trends.</span>
		</a>
	</nav>
</div>

<style>
	.management-landing {
		max-width: 960px;
		margin: 0 auto;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #111827;
		margin: 0 0 1.25rem;
	}

	.summary-bar {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.stat {
		flex: 1;
		min-width: 120px;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1rem;
		text-align: center;
	}

	.stat-value {
		display: block;
		font-size: 1.75rem;
		font-weight: 700;
		color: #111827;
	}

	.stat-value.available {
		color: #059669;
	}

	.stat-value.checked-out {
		color: #dc2626;
	}

	.stat-value.retired {
		color: #6b7280;
	}

	.stat-label {
		display: block;
		font-size: 0.8rem;
		color: #6b7280;
		margin-top: 0.25rem;
	}

	.nav-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
	}

	.nav-card {
		display: flex;
		flex-direction: column;
		padding: 1.25rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.nav-card:hover {
		border-color: #6366f1;
		box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
	}

	.card-icon {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.card-title {
		font-size: 1rem;
		font-weight: 600;
		color: #111827;
		margin-bottom: 0.35rem;
	}

	.card-desc {
		font-size: 0.8rem;
		color: #6b7280;
		line-height: 1.4;
	}

	@media (max-width: 480px) {
		.summary-bar {
			flex-direction: column;
		}

		.nav-cards {
			grid-template-columns: 1fr;
		}
	}
</style>
