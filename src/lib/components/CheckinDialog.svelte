<script lang="ts">
	import type { LibraryGameRecord } from '$lib/server/services/games.js';
	import { getWeightWarningLevel } from '$lib/utils/validation.js';
	import { formatWeight } from '$lib/utils/formatting.js';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		open,
		game,
		gameDisplayTitle,
		weightUnit,
		weightTolerance,
		statusChangeWarning,
		formErrors = {},
		formValues = {},
		onClose,
		onSubmit
	}: {
		open: boolean;
		game: LibraryGameRecord;
		gameDisplayTitle: string;
		weightUnit: string;
		weightTolerance: number;
		statusChangeWarning: boolean;
		formErrors?: Record<string, string>;
		formValues?: Record<string, unknown>;
		onClose: () => void;
		onSubmit: (formData: FormData) => void;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let checkinWeightInput: string = $state('');
	let showPlayAndTakeDialog = $state(false);
	let pendingFormData: FormData | null = $state(null);
	let attendeeTakesGameValue: string = $state('false');

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			dialogEl.showModal();
			checkinWeightInput = '';
			attendeeTakesGameValue = 'false';
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

		if (game.gameType === 'play_and_take') {
			pendingFormData = formData;
			showPlayAndTakeDialog = true;
			return;
		}

		onSubmit(formData);
	}

	function confirmPlayAndTake(takes: boolean) {
		showPlayAndTakeDialog = false;
		if (pendingFormData) {
			pendingFormData.set('attendeeTakesGame', takes ? 'true' : 'false');
			onSubmit(pendingFormData);
			pendingFormData = null;
		}
	}

	function attendeeName(): string {
		const parts = [game.attendeeFirstName, game.attendeeLastName].filter(Boolean);
		return parts.join(' ') || 'Unknown';
	}

	const liveWeightWarning = $derived.by(() => {
		if (!game.checkoutWeight) return null;
		const checkinWeight = parseFloat(checkinWeightInput);
		if (!checkinWeightInput || isNaN(checkinWeight) || checkinWeight <= 0) return null;

		const level = getWeightWarningLevel(game.checkoutWeight, checkinWeight, weightTolerance);
		if (level === 'none') return null;

		const difference = Math.abs(checkinWeight - game.checkoutWeight);
		return {
			checkoutWeight: game.checkoutWeight,
			checkinWeight,
			difference,
			tolerance: weightTolerance,
			level
		};
	});
</script>

<dialog
	bind:this={dialogEl}
	class="checkin-dialog"
	aria-label="Check In {gameDisplayTitle}"
	onkeydown={handleKeydown}
	onclick={handleClick}
>
	<div class="dialog-content">
		<h2 class="dialog-title">Check In: {gameDisplayTitle}</h2>

		{#if statusChangeWarning}
			<div class="status-warning" role="alert">
				This game's status has changed. Please close and try again.
			</div>
		{/if}

		<div class="id-reminder" role="alert">
			<strong>Reminder:</strong> Return {attendeeName()}'s {game.idType || 'ID'}
		</div>

		{#if game.gameType === 'play_and_win'}
			<div class="raffle-reminder" role="alert">
				<strong>Play & Win:</strong> Remember to collect raffle entries from {attendeeName()}
			</div>
		{/if}

		<form method="POST" action="?/checkin" onsubmit={handleSubmit} novalidate>
			<input type="hidden" name="gameId" value={game.id} />
			<input type="hidden" name="attendeeTakesGame" value={attendeeTakesGameValue} />

			<div class="form-group">
				<label for="checkin-checkinWeight">Weight ({weightUnit})</label>
				{#if game.checkoutWeight != null}
					<div class="checkout-weight-reference">
						Checkout weight: <strong>{formatWeight(game.checkoutWeight, weightUnit)}</strong>
					</div>
				{/if}
				<input
					id="checkin-checkinWeight"
					name="checkinWeight"
					type="number"
					step="0.1"
					min="0.1"
					required
					value={formValues?.checkinWeight ?? ''}
					oninput={(e) => { checkinWeightInput = (e.target as HTMLInputElement).value; }}
					class:field-invalid={formErrors?.checkinWeight}
				/>
				{#if formErrors?.checkinWeight}
					<span class="field-error">{formErrors.checkinWeight}</span>
				{/if}
				{#if liveWeightWarning}
					<div class="inline-weight-warning {liveWeightWarning.level === 'red' ? 'warning-red' : 'warning-yellow'}" role="alert">
						{#if liveWeightWarning.level === 'red'}
							<strong>🚨 Weight Discrepancy — Exceeds Tolerance</strong>
						{:else}
							<strong>⚠ Minor Weight Discrepancy</strong>
						{/if}
						<span>
							Checkout: {formatWeight(liveWeightWarning.checkoutWeight, weightUnit)} ·
							Entered: {formatWeight(liveWeightWarning.checkinWeight, weightUnit)}
						</span>
						<span>
							Difference: {formatWeight(liveWeightWarning.difference, weightUnit)}
							(tolerance: {formatWeight(liveWeightWarning.tolerance, weightUnit)})
						</span>
					</div>
				{/if}
			</div>

			<div class="form-group">
				<label for="checkin-note">Note (optional)</label>
				<textarea
					id="checkin-note"
					name="note"
					rows="3"
				>{formValues?.note ?? ''}</textarea>
			</div>

			<div class="dialog-actions">
				<button type="button" class="btn-cancel" onclick={onClose}>Cancel</button>
				<button type="submit" class="btn-submit" disabled={statusChangeWarning}>
					Confirm Check In
				</button>
			</div>
		</form>
	</div>
</dialog>

<ConfirmDialog
	open={showPlayAndTakeDialog}
	title="Play & Take"
	message="Does the attendee want to take this game home?"
	confirmLabel="Yes, take it"
	cancelLabel="No, return it"
	onConfirm={() => confirmPlayAndTake(true)}
	onCancel={() => confirmPlayAndTake(false)}
/>

<style>
	.checkin-dialog {
		border: none;
		border-radius: 8px;
		padding: 0;
		max-width: 28rem;
		width: 90vw;
		margin: auto;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
	}

	.checkin-dialog::backdrop {
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

	.id-reminder {
		padding: 0.6rem 0.75rem;
		background-color: #dbeafe;
		border: 1px solid #3b82f6;
		border-radius: 6px;
		color: #1e40af;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}

	.raffle-reminder {
		padding: 0.6rem 0.75rem;
		background-color: #d1fae5;
		border: 1px solid #10b981;
		border-radius: 6px;
		color: #065f46;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
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

	.checkout-weight-reference {
		font-size: 0.82rem;
		color: #4b5563;
		background-color: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		padding: 0.35rem 0.6rem;
		margin-bottom: 0.4rem;
	}

	.checkout-weight-reference strong {
		color: #111827;
	}

	.form-group input,
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
	.form-group textarea:focus {
		border-color: #10b981;
		box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
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

	.inline-weight-warning {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-top: 0.4rem;
		padding: 0.5rem 0.65rem;
		border-radius: 6px;
		font-size: 0.8rem;
	}

	.inline-weight-warning strong {
		font-size: 0.82rem;
	}

	.inline-weight-warning.warning-yellow {
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		color: #92400e;
	}

	.inline-weight-warning.warning-red {
		background-color: #fee2e2;
		border: 1px solid #ef4444;
		color: #991b1b;
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
		background-color: #10b981;
		color: #fff;
	}

	.btn-submit:hover:not(:disabled) {
		background-color: #059669;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
