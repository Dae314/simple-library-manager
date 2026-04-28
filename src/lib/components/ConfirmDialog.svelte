<script lang="ts">
	let {
		open,
		title,
		message,
		warning = '',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		onConfirm,
		onCancel
	}: {
		open: boolean;
		title: string;
		message: string;
		warning?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			dialogEl.showModal();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	}

	function handleClick(e: MouseEvent) {
		// Close when clicking the backdrop (the dialog element itself, not its children)
		const rect = dialogEl?.getBoundingClientRect();
		if (!rect) return;
		const clickedInside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (!clickedInside) {
			onCancel();
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	class="confirm-dialog"
	aria-label={title}
	onkeydown={handleKeydown}
	onclick={handleClick}
>
	<div class="dialog-content">
		<h2 class="dialog-title">{title}</h2>
		<p class="dialog-message">{message}</p>
		{#if warning}
			<p class="dialog-warning">{warning}</p>
		{/if}
		<div class="dialog-actions">
			<button class="btn-cancel" onclick={onCancel}>{cancelLabel}</button>
			<button class="btn-confirm" onclick={onConfirm}>{confirmLabel}</button>
		</div>
	</div>
</dialog>

<style>
	.confirm-dialog {
		border: none;
		border-radius: 8px;
		padding: 0;
		max-width: 28rem;
		width: 90vw;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
	}

	.confirm-dialog::backdrop {
		background-color: rgba(0, 0, 0, 0.45);
	}

	.dialog-content {
		padding: 1.5rem;
	}

	.dialog-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: #111827;
	}

	.dialog-message {
		font-size: 0.9rem;
		color: #4b5563;
		margin-bottom: 0.75rem;
		line-height: 1.5;
	}

	.dialog-warning {
		font-size: 0.85rem;
		color: #92400e;
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.btn-cancel,
	.btn-confirm {
		padding: 0.45rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background-color 0.15s;
	}

	.btn-cancel {
		background-color: #f3f4f6;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-cancel:hover {
		background-color: #e5e7eb;
	}

	.btn-confirm {
		background-color: #ef4444;
		color: #fff;
	}

	.btn-confirm:hover {
		background-color: #dc2626;
	}
</style>
