<script lang="ts">
	import type { LibraryGameRecord } from '$lib/server/services/games.js';

	let {
		open,
		game,
		gameDisplayTitle,
		idTypes,
		weightUnit,
		prefillWeight,
		statusChangeWarning,
		formErrors = {},
		formValues = {},
		onClose,
		onSubmit
	}: {
		open: boolean;
		game: LibraryGameRecord;
		gameDisplayTitle: string;
		idTypes: string[];
		weightUnit: string;
		prefillWeight: string;
		statusChangeWarning: boolean;
		formErrors?: Record<string, string>;
		formValues?: Record<string, unknown>;
		onClose: () => void;
		onSubmit: (formData: FormData) => void;
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
			onClose();
		}
	}

	function handleClick(e: MouseEvent) {
		const rect = dialogEl?.getBoundingClientRect();
		if (!rect) return;
		const clickedInside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (!clickedInside) {
			onClose();
		}
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const formData = new FormData(form);
		onSubmit(formData);
	}
</script>

<dialog
	bind:this={dialogEl}
	class="checkout-dialog"
	aria-label="Checkout {gameDisplayTitle}"
	onkeydown={handleKeydown}
	onclick={handleClick}
>
	<div class="dialog-content">
		<h2 class="dialog-title">Checkout: {gameDisplayTitle}</h2>

		{#if statusChangeWarning}
			<div class="status-warning" role="alert">
				This game's status has changed. Please close and try again.
			</div>
		{/if}

		<form method="POST" action="?/checkout" onsubmit={handleSubmit} novalidate>
			<input type="hidden" name="gameId" value={game.id} />
			<input type="hidden" name="gameVersion" value={game.version} />

			<div class="form-group">
				<label for="checkout-attendeeFirstName">First Name</label>
				<input
					id="checkout-attendeeFirstName"
					name="attendeeFirstName"
					type="text"
					required
					value={formValues?.attendeeFirstName ?? ''}
					class:field-invalid={formErrors?.attendeeFirstName}
				/>
				{#if formErrors?.attendeeFirstName}
					<span class="field-error">{formErrors.attendeeFirstName}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="checkout-attendeeLastName">Last Name</label>
				<input
					id="checkout-attendeeLastName"
					name="attendeeLastName"
					type="text"
					required
					value={formValues?.attendeeLastName ?? ''}
					class:field-invalid={formErrors?.attendeeLastName}
				/>
				{#if formErrors?.attendeeLastName}
					<span class="field-error">{formErrors.attendeeLastName}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="checkout-idType">ID Type</label>
				<select
					id="checkout-idType"
					name="idType"
					required
					class:field-invalid={formErrors?.idType}
				>
					<option value="">Select ID type...</option>
					{#each idTypes as idType (idType)}
						<option value={idType} selected={formValues?.idType === idType}>{idType}</option>
					{/each}
				</select>
				{#if formErrors?.idType}
					<span class="field-error">{formErrors.idType}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="checkout-checkoutWeight">Weight ({weightUnit})</label>
				<input
					id="checkout-checkoutWeight"
					name="checkoutWeight"
					type="number"
					step="0.1"
					min="0.1"
					required
					value={formValues?.checkoutWeight ?? prefillWeight}
					class:field-invalid={formErrors?.checkoutWeight}
				/>
				{#if formErrors?.checkoutWeight}
					<span class="field-error">{formErrors.checkoutWeight}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="checkout-note">Note (optional)</label>
				<textarea
					id="checkout-note"
					name="note"
					rows="3"
				>{formValues?.note ?? ''}</textarea>
			</div>

			<div class="dialog-actions">
				<button type="button" class="btn-cancel" onclick={onClose}>Cancel</button>
				<button type="submit" class="btn-submit" disabled={statusChangeWarning}>
					Confirm Checkout
				</button>
			</div>
		</form>
	</div>
</dialog>

<style>
	.checkout-dialog {
		border: none;
		border-radius: 8px;
		padding: 0;
		max-width: 28rem;
		width: 90vw;
		margin: auto;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
	}

	.checkout-dialog::backdrop {
		background-color: rgba(0, 0, 0, 0.45);
	}

	.dialog-content {
		padding: 1.5rem;
	}

	.dialog-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.status-warning {
		font-size: 0.85rem;
		color: #92400e;
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
		line-height: 1.4;
	}

	.form-group {
		margin-bottom: 0.85rem;
	}

	.form-group label {
		display: block;
		font-size: 0.85rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.25rem;
	}

	.form-group input,
	.form-group select,
	.form-group textarea {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.form-group textarea {
		resize: vertical;
	}

	.field-invalid {
		border-color: #ef4444;
	}

	.field-error {
		display: block;
		font-size: 0.8rem;
		color: #ef4444;
		margin-top: 0.2rem;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.btn-cancel,
	.btn-submit {
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

	.btn-submit {
		background-color: #6366f1;
		color: #fff;
	}

	.btn-submit:hover:not(:disabled) {
		background-color: #4f46e5;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
