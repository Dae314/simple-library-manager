<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import toast from 'svelte-hot-french-toast';

	let { form }: { form: Record<string, any> | null } = $props();

	let showImportDialog = $state(false);
	let selectedFile: File | null = $state(null);
	let fileInputEl: HTMLInputElement | undefined = $state();
	let importing = $state(false);
	let confirmPassword = $state('');

	let importDialogEl: HTMLDialogElement | undefined = $state();

	let isPasswordSet = $derived($page.data.isPasswordSet);

	$effect(() => {
		if (!importDialogEl) return;
		if (showImportDialog && !importDialogEl.open) {
			importDialogEl.showModal();
		} else if (!showImportDialog && importDialogEl.open) {
			importDialogEl.close();
		}
	});

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		selectedFile = file;
	}

	function openImportDialog() {
		if (!selectedFile) {
			toast.error('Please select a backup file first');
			return;
		}
		confirmPassword = '';
		showImportDialog = true;
	}

	function cancelImportDialog() {
		showImportDialog = false;
		confirmPassword = '';
	}

	function handleDialogKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancelImportDialog();
		}
	}

	function handleDialogClick(e: MouseEvent) {
		const rect = importDialogEl?.getBoundingClientRect();
		if (!rect) return;
		const clickedInside =
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom;
		if (!clickedInside) {
			cancelImportDialog();
		}
	}

	function confirmImport() {
		showImportDialog = false;
		importing = true;
		const importForm = document.getElementById('import-form') as HTMLFormElement;
		if (importForm && selectedFile) {
			const dt = new DataTransfer();
			dt.items.add(selectedFile);
			const fileInput = importForm.querySelector('input[name="backupFile"]') as HTMLInputElement;
			if (fileInput) {
				fileInput.files = dt.files;
			}
			// Set the confirmPassword hidden input value
			const passwordInput = importForm.querySelector('input[name="confirmPassword"]') as HTMLInputElement;
			if (passwordInput) {
				passwordInput.value = confirmPassword;
			}
			importForm.requestSubmit();
		}
		confirmPassword = '';
	}
</script>

<div class="backup-page">
	<div class="page-header">
		<a href="/management" class="back-link" aria-label="Back to management">&larr; Management</a>
		<h1>Database Backup</h1>
	</div>

	<section class="backup-section">
		<h2>Export</h2>
		<p class="section-desc">Download a full backup of the database. This file can be used to restore the system to its current state.</p>
		<a href="/api/backup/export" class="btn btn-primary" download>
			Download Backup
		</a>
	</section>

	<section class="backup-section">
		<h2>Import</h2>
		<p class="section-desc">
			Restore the database from a previously exported backup file. This will replace all current data.
		</p>

		<p class="restore-warning">
			Note: Restoring a backup will replace the current password hash with whatever is in the backup file. If you lose access after a restore, use the password reset script (<code>scripts/reset-password.js</code>) to clear the password.
		</p>

		<div class="import-controls">
			<div class="file-picker">
				<input
					bind:this={fileInputEl}
					type="file"
					accept=".dump,.backup,.sql"
					onchange={handleFileSelect}
					aria-label="Select backup file"
				/>
			</div>

			{#if selectedFile}
				<p class="file-info">
					Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
				</p>
			{/if}

			<button
				class="btn btn-danger"
				onclick={openImportDialog}
				disabled={importing}
			>
				{importing ? 'Importing…' : 'Restore from Backup'}
			</button>
		</div>
	</section>
</div>

<!-- Custom restore confirmation dialog (replaces ConfirmDialog to support password field) -->
<dialog
	bind:this={importDialogEl}
	class="confirm-dialog"
	aria-label="Restore Database"
	onkeydown={handleDialogKeydown}
	onclick={handleDialogClick}
>
	<div class="dialog-content">
		<h2 class="dialog-title">Restore Database</h2>
		<p class="dialog-message">Are you sure you want to restore the database from this backup? All current data will be replaced.</p>
		<p class="dialog-warning">This action cannot be undone. Make sure you have a current backup before proceeding. Please ensure all librarians stop their activities until the restore is complete.</p>

		{#if isPasswordSet}
			<div class="dialog-password-field">
				<label for="restore-confirm-password">Enter your password to confirm</label>
				<input
					id="restore-confirm-password"
					type="password"
					autocomplete="current-password"
					bind:value={confirmPassword}
				/>
			</div>
		{/if}

		<div class="dialog-actions">
			<button class="btn-cancel" onclick={cancelImportDialog}>Cancel</button>
			<button
				class="btn-confirm"
				onclick={confirmImport}
				disabled={isPasswordSet && !confirmPassword}
			>Restore</button>
		</div>
	</div>
</dialog>

<!-- Hidden import form -->
<form
	id="import-form"
	method="POST"
	action="?/import"
	enctype="multipart/form-data"
	class="hidden-form"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				toast.success('Database restored successfully. The page will reload.');
				selectedFile = null;
				importing = false;
				setTimeout(() => window.location.reload(), 1500);
			} else if (result.type === 'failure') {
				const data = (result as any).data;
				if (data?.error) {
					toast.error(data.error);
				}
				importing = false;
			}
			await update({ reset: false });
		};
	}}
>
	<input type="file" name="backupFile" />
	<input type="hidden" name="confirmPassword" />
</form>

<style>
	.backup-page {
		max-width: 560px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		flex-flow: column;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.back-link {
		font-size: 0.85rem;
		color: #6366f1;
		text-decoration: none;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #111827;
		margin: 0;
	}

	h2 {
		font-size: 1.1rem;
		font-weight: 600;
		color: #1f2937;
		margin-bottom: 0.5rem;
	}

	.backup-section {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.section-desc {
		font-size: 0.85rem;
		color: #6b7280;
		margin-bottom: 1rem;
		line-height: 1.5;
	}

	.restore-warning {
		font-size: 0.8rem;
		color: #92400e;
		background-color: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
		line-height: 1.4;
	}

	.restore-warning code {
		font-size: 0.78rem;
		background-color: rgba(0, 0, 0, 0.06);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}

	.import-controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.file-picker input {
		font-size: 0.875rem;
	}

	.file-info {
		font-size: 0.85rem;
		color: #374151;
	}

	.btn {
		display: inline-block;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background-color 0.15s;
	}

	.btn-primary {
		background-color: #6366f1;
		color: #fff;
	}

	.btn-primary:hover {
		background-color: #4f46e5;
	}

	.btn-danger {
		background-color: #ef4444;
		color: #fff;
	}

	.btn-danger:hover:not(:disabled) {
		background-color: #dc2626;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hidden-form {
		display: none;
	}

	/* Custom restore confirmation dialog styles */
	.confirm-dialog {
		border: none;
		border-radius: 8px;
		padding: 0;
		max-width: 28rem;
		width: 90vw;
		margin: auto;
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

	.dialog-password-field {
		margin-bottom: 0.75rem;
	}

	.dialog-password-field label {
		display: block;
		font-size: 0.85rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.25rem;
	}

	.dialog-password-field input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.dialog-password-field input:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
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

	.btn-confirm:hover:not(:disabled) {
		background-color: #dc2626;
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
