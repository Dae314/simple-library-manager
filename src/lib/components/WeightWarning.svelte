<script lang="ts">
	import { formatWeight } from '$lib/utils/formatting';

	let {
		checkoutWeight,
		checkinWeight,
		tolerance,
		weightUnit,
		onDismiss
	}: {
		checkoutWeight: number;
		checkinWeight: number;
		tolerance: number;
		weightUnit: string;
		onDismiss: () => void;
	} = $props();

	const difference = $derived(Math.abs(checkinWeight - checkoutWeight));
</script>

<div class="weight-warning" role="alert">
	<div class="warning-content">
		<strong>Weight Discrepancy Detected</strong>
		<p>
			Checkout: {formatWeight(checkoutWeight, weightUnit)} · Checkin: {formatWeight(checkinWeight, weightUnit)}
		</p>
		<p>
			Difference: {formatWeight(difference, weightUnit)} (tolerance: {formatWeight(tolerance, weightUnit)})
		</p>
	</div>
	<button class="dismiss-btn" onclick={onDismiss} aria-label="Dismiss warning">✕</button>
</div>

<style>
	.weight-warning {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 6px;
		color: #92400e;
	}

	.warning-content {
		flex: 1;
	}

	.warning-content strong {
		display: block;
		margin-bottom: 0.25rem;
	}

	.warning-content p {
		margin: 0.15rem 0;
		font-size: 0.9rem;
	}

	.dismiss-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		color: #92400e;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 4px;
	}

	.dismiss-btn:hover {
		background-color: rgba(0, 0, 0, 0.08);
	}
</style>
