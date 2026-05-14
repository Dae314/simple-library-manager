<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { getContext, onMount } from 'svelte';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import toast from 'svelte-hot-french-toast';
	import { getPreferredPageSize, savePreferredPageSize } from '$lib/utils/page-size.js';

	const wsClient: { connected: boolean } = getContext('ws');

	type AttendeeRecord = {
		id: number;
		firstName: string;
		lastName: string;
		idType: string;
		transactionCount: number;
	};

	type PaginatedResult = {
		items: AttendeeRecord[];
		total: number;
		page: number;
		pageSize: number;
	};

	type FilterValues = {
		search: string;
		idType: string;
		sortField: string;
		sortDir: string;
		page: number;
		pageSize: number;
	};

	let { data, form }: {
		data: {
			attendees: PaginatedResult;
			idTypes: string[];
			filters: FilterValues;
		};
		form: any;
	} = $props();

	let showDeleteDialog = $state(false);
	let deleteTarget: AttendeeRecord | null = $state(null);
	let deleteTransactionCount = $state(0);

	// Show error toast from form action
	$effect(() => {
		if (form?.error) {
			toast.error(form.error);
		}
	});

	const columns = [
		{ key: 'firstName', label: 'First Name', sortField: 'first_name' },
		{ key: 'lastName', label: 'Last Name', sortField: 'last_name' },
		{ key: 'idType', label: 'ID Type', sortField: 'id_type' },
		{ key: 'transactionCount', label: 'Transactions', sortField: 'transaction_count' },
		{ key: 'actions', label: 'Actions', srOnly: true }
	];

	let idTypeOptions = $derived(
		data.idTypes.map((t) => ({ value: t, label: t }))
	);

	let filterConfigs = $derived([
		{ key: 'search', label: 'Search', type: 'text' as const, placeholder: 'Search by name...' },
		{
			key: 'idType', label: 'ID Type', type: 'select' as const,
			options: idTypeOptions
		}
	]);

	let filterValues = $derived({
		search: data.filters.search,
		idType: data.filters.idType
	});

	function updateUrl(params: Record<string, string>) {
		const url = new URL(window.location.href);
		for (const [key, value] of Object.entries(params)) {
			if (value) {
				url.searchParams.set(key, value);
			} else {
				url.searchParams.delete(key);
			}
		}
		url.searchParams.delete('page');
		goto(url.toString(), { replaceState: true, keepFocus: true });
	}

	function handleFilterChange(values: Record<string, any>) {
		const params: Record<string, string> = {};
		for (const [key, value] of Object.entries(values)) {
			params[key] = String(value ?? '');
		}
		updateUrl(params);
	}

	function handleSort(field: string, direction: 'asc' | 'desc') {
		updateUrl({ sortField: field, sortDir: direction });
	}

	function handlePageChange(page: number) {
		const url = new URL(window.location.href);
		url.searchParams.set('page', String(page));
		goto(url.toString(), { replaceState: true });
	}

	function handlePageSizeChange(size: number) {
		savePreferredPageSize(size);
		const url = new URL(window.location.href);
		url.searchParams.set('pageSize', String(size));
		url.searchParams.set('page', '1');
		goto(url.toString(), { replaceState: true });
	}

	// Apply stored page size preference when navigating to this page without an explicit pageSize param
	onMount(() => {
		const currentUrl = new URL(window.location.href);
		if (!currentUrl.searchParams.has('pageSize')) {
			const preferred = getPreferredPageSize();
			if (preferred !== data.attendees.pageSize) {
				currentUrl.searchParams.set('pageSize', String(preferred));
				currentUrl.searchParams.set('page', '1');
				goto(currentUrl.toString(), { replaceState: true });
			}
		}
	});

	function navigateToAttendee(e: MouseEvent, attendeeId: number) {
		const target = e.target as HTMLElement;
		if (target.closest('button, a, input, form, label')) return;
		goto(`/management/attendees/${attendeeId}`);
	}

	async function confirmDelete(attendee: AttendeeRecord) {
		deleteTarget = attendee;
		deleteTransactionCount = attendee.transactionCount;
		showDeleteDialog = true;
	}

	function executeDelete() {
		showDeleteDialog = false;
		const deleteForm = document.getElementById('delete-form') as HTMLFormElement;
		if (deleteForm) deleteForm.requestSubmit();
	}
</script>

<div class="management-page">
	<div class="page-header">
		<div class="header-left">
			<a href="/management" class="back-link" aria-label="Back to management">&larr; Management</a>
			<h1>Attendees <ConnectionIndicator connected={wsClient.connected} /></h1>
		</div>
	</div>

	<SortableTable
		{columns}
		items={data.attendees.items}
		totalItems={data.attendees.total}
		currentPage={data.attendees.page}
		pageSize={data.attendees.pageSize}
		sortField={data.filters.sortField}
		sortDirection={data.filters.sortDir}
		filters={filterConfigs}
		{filterValues}
		emptyMessage="No attendees found matching your filters."
		onSort={handleSort}
		onFilterChange={handleFilterChange}
		onPageChange={handlePageChange}
		onPageSizeChange={handlePageSizeChange}
	>
		{#snippet row(attendee)}
			<tr
				class="clickable-row"
				onclick={(e) => navigateToAttendee(e, attendee.id)}
			>
				<td>
					<span class="attendee-name">{attendee.firstName}</span>
				</td>
				<td>
					<span class="attendee-name">{attendee.lastName}</span>
				</td>
				<td>{attendee.idType}</td>
				<td>{attendee.transactionCount}</td>
				<td class="actions-cell">
					<button
						class="btn-inline btn-inline-danger"
						aria-label="Delete {attendee.firstName} {attendee.lastName}"
						onclick={() => confirmDelete(attendee)}
					>
						Delete
					</button>
					<a href="/management/attendees/{attendee.id}" class="btn-edit" aria-label="Edit {attendee.firstName} {attendee.lastName}">
						Edit
					</a>
				</td>
			</tr>
		{/snippet}
	</SortableTable>
</div>

<!-- Delete Confirm Dialog -->
<ConfirmDialog
	open={showDeleteDialog}
	title="Delete Attendee"
	message="Are you sure you want to delete {deleteTarget?.firstName} {deleteTarget?.lastName}? This will cascade-delete {deleteTransactionCount} transaction(s)."
	warning={deleteTransactionCount > 0 ? `${deleteTransactionCount} transaction(s) will be permanently deleted.` : ''}
	confirmLabel="Delete"
	cancelLabel="Cancel"
	onCancel={() => { showDeleteDialog = false; deleteTarget = null; }}
	onConfirm={executeDelete}
/>

<!-- Hidden delete form -->
<form
	id="delete-form"
	method="POST"
	action="?/delete"
	class="hidden-form"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				toast.success(`Deleted "${deleteTarget?.firstName} ${deleteTarget?.lastName}"`);
				deleteTarget = null;
			} else if (result.type === 'failure') {
				const data = (result as any).data;
				toast.error(data?.error || 'Failed to delete attendee');
			}
			await update();
		};
	}}
>
	<input type="hidden" name="id" value={deleteTarget?.id ?? ''} />
</form>

<style>
	.management-page {
		max-width: 960px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
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

	.attendee-name {
		font-weight: 600;
		color: #111827;
	}

	.actions-cell {
		white-space: nowrap;
	}

	.btn-inline {
		font-size: 0.75rem;
		padding: 0.2em 0.5em;
		border-radius: 4px;
		cursor: pointer;
		border: 1px solid transparent;
		font-weight: 500;
		transition: background-color 0.15s;
	}

	.btn-inline-danger {
		background-color: #fee2e2;
		color: #991b1b;
		border-color: #fecaca;
	}

	.btn-inline-danger:hover {
		background-color: #fecaca;
	}

	.btn-edit {
		font-size: 0.8rem;
		color: #6366f1;
		text-decoration: none;
		padding: 0.2em 0.5em;
		border-radius: 4px;
		transition: background-color 0.15s;
	}

	.btn-edit:hover {
		background-color: #eef2ff;
		text-decoration: underline;
	}

	.hidden-form {
		display: none;
	}

	:global(.clickable-row) {
		cursor: pointer;
	}

	@media (max-width: 640px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
