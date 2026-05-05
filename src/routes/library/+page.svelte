<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { getContext, untrack, onMount, onDestroy } from 'svelte';
	import toast from 'svelte-hot-french-toast';
	import SortableTable from '$lib/components/SortableTable.svelte';
	import GameTypeBadge from '$lib/components/GameTypeBadge.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import CheckoutDialog from '$lib/components/CheckoutDialog.svelte';
	import CheckinDialog from '$lib/components/CheckinDialog.svelte';
	import { formatDuration, formatWeight, formatDateTime } from '$lib/utils/formatting.js';
	import { getPreferredPageSize, savePreferredPageSize } from '$lib/utils/page-size.js';
	import type { LibraryGameRecord } from '$lib/server/services/games.js';
	import type { EventMessage } from '$lib/server/ws/events.js';

	const wsClient: {
		connected: boolean;
		setOnConflict: (handler: (event: EventMessage) => void) => void;
	} = getContext('ws');

	type PaginatedResult = {
		items: LibraryGameRecord[];
		total: number;
		page: number;
		pageSize: number;
	};

	let { data, form }: {
		data: {
			games: PaginatedResult;
			idTypes: string[];
			weightUnit: string;
			weightTolerance: number;
			lastWeights: Record<number, number>;
			sortField: string;
			sortDir: string;
			activeStatus: string;
			activeGameType: string;
			activeSearch: string;
			activeAttendeeSearch: string;
		};
		form: {
			errors?: Record<string, string>;
			values?: Record<string, unknown>;
			gameId?: number;
			success?: boolean;
			conflict?: boolean;
			message?: string;
			error?: string;
			weightWarning?: {
				checkoutWeight: number;
				checkinWeight: number;
				difference: number;
				tolerance: number;
				level: string;
				weightUnit: string;
			};
		} | null;
	} = $props();

	// Tick counter that increments every minute to force duration recalculation
	let durationTick = $state(0);
	let durationInterval: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		durationInterval = setInterval(() => {
			durationTick++;
		}, 60_000);
	});

	onDestroy(() => {
		if (durationInterval) clearInterval(durationInterval);
	});

	let selectedGame: LibraryGameRecord | null = $state(null);
	let dialogMode: 'checkout' | 'checkin' | null = $state(null);
	let statusChangeWarning: boolean = $state(false);
	let triggerButtonRef: HTMLButtonElement | null = $state(null);
	let checkoutFormErrors: Record<string, string> = $state({});
	let checkoutFormValues: Record<string, unknown> = $state({});
	let checkinFormErrors: Record<string, string> = $state({});
	let checkinFormValues: Record<string, unknown> = $state({});

	// Sync selectedGame with refreshed data by matching game ID
	$effect(() => {
		const items = data.games.items;
		const current = untrack(() => selectedGame);
		if (current) {
			const fresh = items.find((g) => g.id === current.id);
			if (fresh) {
				selectedGame = fresh;
			}
		}
	});

	// Wire WebSocket conflict detection for open dialogs
	wsClient.setOnConflict((event: EventMessage) => {
		const gameId = 'gameId' in event ? (event as any).gameId : undefined;
		if (gameId !== undefined && selectedGame && gameId === selectedGame.id) {
			statusChangeWarning = true;
			invalidateAll();
		}
	});

	const columns = [
		{ key: 'title', label: 'Title', sortField: 'title' },
		{ key: 'type', label: 'Type', sortField: 'game_type' },
		{ key: 'status', label: 'Status', sortField: 'status' },
		{ key: 'bggId', label: 'BGG', sortField: 'bgg_id' },
		{ key: 'attendee', label: 'Attendee' },
		{ key: 'duration', label: 'Duration' },
		{ key: 'weight', label: 'Weight' },
		{ key: 'actions', label: 'Actions', srOnly: true }
	];

	const filters = [
		{ key: 'search', label: 'Game Title', type: 'text' as const, placeholder: 'Search by game title...' },
		{ key: 'attendeeSearch', label: 'Attendee', type: 'text' as const, placeholder: 'Search by attendee name...' },
		{
			key: 'status', label: 'Status', type: 'select' as const,
			options: [
				{ value: 'available', label: 'Available' },
				{ value: 'checked_out', label: 'Checked Out' }
			]
		},
		{
			key: 'gameType', label: 'Type', type: 'select' as const,
			options: [
				{ value: 'standard', label: 'Standard' },
				{ value: 'play_and_win', label: 'Play & Win' },
				{ value: 'play_and_take', label: 'Play & Take' }
			]
		}
	];

	let filterValues = $derived({
		search: data.activeSearch,
		attendeeSearch: data.activeAttendeeSearch,
		status: data.activeStatus,
		gameType: data.activeGameType
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
		const url = new URL(window.location.href);
		if (!url.searchParams.has('pageSize')) {
			const preferred = getPreferredPageSize();
			if (preferred !== data.games.pageSize) {
				url.searchParams.set('pageSize', String(preferred));
				url.searchParams.set('page', '1');
				goto(url.toString(), { replaceState: true });
			}
		}
	});

	function gameDisplayTitle(game: LibraryGameRecord): string {
		return game.totalCopies > 1 ? `${game.title} (Copy #${game.copyNumber})` : game.title;
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'available': return 'Available';
			case 'checked_out': return 'Checked Out';
			default: return status;
		}
	}

	function attendeeName(game: LibraryGameRecord): string {
		const parts = [game.attendeeFirstName, game.attendeeLastName].filter(Boolean);
		return parts.join(' ') || '—';
	}

	function getCheckoutDuration(game: LibraryGameRecord, _tick: number): string {
		if (!game.checkoutAt) return '—';
		const checkoutDate = typeof game.checkoutAt === 'string' ? new Date(game.checkoutAt as unknown as string) : game.checkoutAt;
		const ms = Date.now() - checkoutDate.getTime();
		return formatDuration(ms);
	}

	function openCheckoutDialog(game: LibraryGameRecord, button: HTMLButtonElement) {
		selectedGame = game;
		dialogMode = 'checkout';
		statusChangeWarning = false;
		checkoutFormErrors = {};
		checkoutFormValues = {};
		triggerButtonRef = button;
	}

	function openCheckinDialog(game: LibraryGameRecord, button: HTMLButtonElement) {
		selectedGame = game;
		dialogMode = 'checkin';
		statusChangeWarning = false;
		checkinFormErrors = {};
		checkinFormValues = {};
		triggerButtonRef = button;
	}

	function closeDialog() {
		dialogMode = null;
		selectedGame = null;
		statusChangeWarning = false;
		checkoutFormErrors = {};
		checkoutFormValues = {};
		checkinFormErrors = {};
		checkinFormValues = {};
		if (triggerButtonRef) {
			triggerButtonRef.focus();
			triggerButtonRef = null;
		}
	}

	function handleCheckoutSubmit(formData: FormData) {
		// Submit via fetch with SvelteKit action format
		fetch('?/checkout', {
			method: 'POST',
			body: formData,
			headers: { 'x-sveltekit-action': 'true' }
		}).then(async (response) => {
			const text = await response.text();
			const { deserialize } = await import('$app/forms');
			const result = deserialize(text);
			if (result.type === 'success') {
				toast.success('Game checked out successfully!');
				closeDialog();
			} else if (result.type === 'failure') {
				const resultData = (result as any).data;
				if (resultData?.conflict) {
					toast.error(resultData.message || 'This game was just checked out by another station.');
					closeDialog();
				} else if (resultData?.error) {
					toast.error(resultData.error);
				} else if (resultData?.errors) {
					checkoutFormErrors = resultData.errors;
					checkoutFormValues = resultData.values ?? {};
				}
			}
			const { invalidateAll } = await import('$app/navigation');
			await invalidateAll();
		});
	}

	function handleCheckinSubmit(formData: FormData) {
		fetch('?/checkin', {
			method: 'POST',
			body: formData,
			headers: { 'x-sveltekit-action': 'true' }
		}).then(async (response) => {
			const text = await response.text();
			const { deserialize } = await import('$app/forms');
			const result = deserialize(text);
			if (result.type === 'success') {
				toast.success('Game checked in successfully!');
				closeDialog();
			} else if (result.type === 'failure') {
				const resultData = (result as any).data;
				if (resultData?.conflict) {
					toast.error(resultData.message || 'This game is no longer checked out.');
					closeDialog();
				} else if (resultData?.error) {
					toast.error(resultData.error);
				} else if (resultData?.errors) {
					checkinFormErrors = resultData.errors;
					checkinFormValues = resultData.values ?? {};
				}
			}
			const { invalidateAll } = await import('$app/navigation');
			await invalidateAll();
		});
	}

	const selectedGameTitle = $derived(selectedGame ? gameDisplayTitle(selectedGame) : '');
	const prefillWeight = $derived.by(() => {
		const game = selectedGame;
		if (!game) return '';
		return String(data.lastWeights[game.id] ?? '');
	});
</script>

<h1>Library <ConnectionIndicator connected={wsClient.connected} /></h1>

<SortableTable
	{columns}
	items={data.games.items}
	totalItems={data.games.total}
	currentPage={data.games.page}
	pageSize={data.games.pageSize}
	sortField={data.sortField}
	sortDirection={data.sortDir}
	{filters}
	{filterValues}
	emptyMessage="No games found matching your filters."
	onSort={handleSort}
	onFilterChange={handleFilterChange}
	onPageChange={handlePageChange}
	onPageSizeChange={handlePageSizeChange}
>
	{#snippet row(game)}
		<tr>
			<td>
				<span class="game-title">{gameDisplayTitle(game)}</span>
			</td>
			<td><GameTypeBadge gameType={game.gameType} /></td>
			<td>
				<span class="status-indicator {game.status}">
					{statusLabel(game.status)}
				</span>
			</td>
			<td>
				<a
					href="https://boardgamegeek.com/boardgame/{game.bggId}"
					target="_blank"
					rel="noopener noreferrer"
					class="bgg-link"
				>#{game.bggId}</a>
			</td>
			<td>
				{#if game.status === 'checked_out'}
					{attendeeName(game)}
				{:else}
					—
				{/if}
			</td>
			<td>
				{#if game.status === 'checked_out'}
					<span class="duration" title="Checked out: {formatDateTime(game.checkoutAt)}">{getCheckoutDuration(game, durationTick)}</span>
				{:else}
					—
				{/if}
			</td>
			<td>
				{#if game.status === 'checked_out' && game.checkoutWeight != null}
					{formatWeight(game.checkoutWeight, data.weightUnit)}
				{:else}
					—
				{/if}
			</td>
			<td>
				{#if game.status === 'available'}
					<button
						class="btn-checkout"
						onclick={(e) => openCheckoutDialog(game, e.currentTarget as HTMLButtonElement)}
					>
						Checkout
					</button>
				{:else if game.status === 'checked_out'}
					<button
						class="btn-checkin"
						onclick={(e) => openCheckinDialog(game, e.currentTarget as HTMLButtonElement)}
					>
						Check In
					</button>
				{/if}
			</td>
		</tr>
	{/snippet}
</SortableTable>

{#if selectedGame && dialogMode === 'checkout'}
	<CheckoutDialog
		open={true}
		game={selectedGame}
		gameDisplayTitle={selectedGameTitle}
		idTypes={data.idTypes}
		weightUnit={data.weightUnit}
		{prefillWeight}
		{statusChangeWarning}
		formErrors={checkoutFormErrors}
		formValues={checkoutFormValues}
		onClose={closeDialog}
		onSubmit={handleCheckoutSubmit}
	/>
{/if}

{#if selectedGame && dialogMode === 'checkin'}
	<CheckinDialog
		open={true}
		game={selectedGame}
		gameDisplayTitle={selectedGameTitle}
		weightUnit={data.weightUnit}
		weightTolerance={data.weightTolerance}
		{statusChangeWarning}
		formErrors={checkinFormErrors}
		formValues={checkinFormValues}
		onClose={closeDialog}
		onSubmit={handleCheckinSubmit}
	/>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: #111827;
	}

	.game-title {
		font-weight: 600;
		color: #111827;
	}

	.bgg-link {
		font-size: 0.8rem;
		color: #6366f1;
		text-decoration: none;
	}

	.bgg-link:hover {
		text-decoration: underline;
	}

	.status-indicator {
		display: inline-block;
		padding: 0.2em 0.6em;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.status-indicator.available {
		background-color: #d1fae5;
		color: #065f46;
	}

	.status-indicator.checked_out {
		background-color: #fee2e2;
		color: #991b1b;
	}

	.duration {
		color: #6b7280;
		font-size: 0.85rem;
	}

	.btn-checkout {
		padding: 0.35rem 0.75rem;
		background-color: #6366f1;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 0.15s;
	}

	.btn-checkout:hover {
		background-color: #4f46e5;
	}

	.btn-checkin {
		padding: 0.35rem 0.75rem;
		background-color: #10b981;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 0.15s;
	}

	.btn-checkin:hover {
		background-color: #059669;
	}
</style>
