<script lang="ts">
	let { connected }: { connected: boolean } = $props();
</script>

<div class="connection-indicator" role="status" aria-live="polite">
	<span class="dot" class:connected class:disconnected={!connected}></span>
	<span class="sr-only">{connected ? 'Live updates active' : 'Live updates disconnected'}</span>
</div>

<style>
	.connection-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		transition: background-color 0.2s;
	}

	.dot.connected {
		background-color: #22c55e;
		box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
	}

	.dot.disconnected {
		background-color: #f59e0b;
		box-shadow: 0 0 4px rgba(245, 158, 11, 0.4);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
