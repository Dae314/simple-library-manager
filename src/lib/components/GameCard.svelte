<script lang="ts">
	import GameTypeBadge from './GameTypeBadge.svelte';
	import type { Snippet } from 'svelte';

	type GameType = 'standard' | 'play_and_win' | 'play_and_take';

	let {
		title,
		bggId,
		copyNumber,
		totalCopies = 1,
		gameType,
		selected = false,
		children
	}: {
		title: string;
		bggId: number;
		copyNumber: number;
		totalCopies?: number;
		gameType: GameType;
		selected?: boolean;
		children?: Snippet;
	} = $props();

	const displayTitle = $derived(
		totalCopies > 1 ? `${title} (Copy #${copyNumber})` : title
	);
</script>

<div class="game-card" class:selected>
	<div class="game-info">
		<div class="game-title-row">
			<span class="game-title">{displayTitle}</span>
			<GameTypeBadge {gameType} />
		</div>
		<div class="game-meta">
			<a
				href="https://boardgamegeek.com/boardgame/{bggId}"
				target="_blank"
				rel="noopener noreferrer"
				class="bgg-link"
			>
				BGG #{bggId}
			</a>
		</div>
	</div>
	{#if children}
		<div class="game-actions">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.game-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		background: #fff;
		transition: border-color 0.15s;
	}

	.game-card:hover {
		border-color: #6366f1;
	}

	.game-card.selected {
		border-color: #6366f1;
		background-color: #f5f3ff;
	}

	.game-info {
		min-width: 0;
		flex: 1;
	}

	.game-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.game-title {
		font-weight: 600;
		font-size: 0.95rem;
		color: #111827;
	}

	.game-meta {
		margin-top: 0.2rem;
	}

	.bgg-link {
		font-size: 0.8rem;
		color: #6366f1;
		text-decoration: none;
	}

	.bgg-link:hover {
		text-decoration: underline;
	}

	.game-actions {
		flex-shrink: 0;
		margin-left: 0.75rem;
	}
</style>
