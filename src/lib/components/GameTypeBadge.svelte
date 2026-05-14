<script lang="ts">
	type PrizeType = 'standard' | 'play_and_win' | 'play_and_take';

	let { prizeType }: { prizeType: PrizeType } = $props();

	const labels: Record<PrizeType, string> = {
		standard: 'Standard',
		play_and_win: 'Play & Win',
		play_and_take: 'Play & Take'
	};
</script>

<span class="badge {prizeType}">{labels[prizeType]}</span>

<style>
	.badge {
		display: inline-block;
		padding: 0.15em 0.5em;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
		vertical-align: middle;
	}

	.standard {
		background-color: #e5e7eb;
		color: #374151;
	}

	.play_and_win {
		background-color: #d1fae5;
		color: #065f46;
	}

	.play_and_take {
		background-color: #ede9fe;
		color: #5b21b6;
	}
</style>
