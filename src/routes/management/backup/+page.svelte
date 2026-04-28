<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import toast from 'svelte-hot-french-toast';

	let { form }: { form: Record<string, any> | null } = $props();

	let showImportDialog = $state(false);
	let selectedFile: File | null = $state(null);
	let fileInputEl: HTMLInputElement | undefined = $state();
	let importing = $state(false);

	$effect(() => {
		if (form?.success) {
			toast.success('Database restored successfully. The page will reload.');
			selectedFile = null;
			importing = false;
			setTimeout(() => window.location.reload(), 1500);
		}
		if (form?.error) {
			toast.error(form.error);
			importing = false;
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
		showImportDialog = true;
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
				importForm.requestSubmit();
			}
		}
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
				disabled={!selectedFile || importing}
			>
				{importing ? 'Importing…' : 'Restore from Backup'}
			</button>
		</div>
	</section>
</div>

<ConfirmDialog
	open={showImportDialog}
	title="Restore Database"
	message="Are you sure you want to restore the database from this backup? All current data will be replaced."
	warning="This action cannot be undone. Make sure you have a current backup before proceeding."
	confirmLabel="Restore"
	cancelLabel="Cancel"
	onCancel={() => (showImportDialog = false)}
	onConfirm={confirmImport}
/>

<!-- Hidden import form -->
<form
	id="import-form"
	method="POST"
	action="?/import"
	enctype="multipart/form-data"
	class="hidden-form"
	use:enhance
>
	<input type="file" name="backupFile" />
</form>

<style>
	.backup-page {
		max-width: 560px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
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
</style>
