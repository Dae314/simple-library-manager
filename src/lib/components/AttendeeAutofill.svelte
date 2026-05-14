<script lang="ts">
	interface AttendeeRecord {
		id: number;
		firstName: string;
		lastName: string;
		idType: string;
		createdAt: Date;
		updatedAt: Date;
	}

	let {
		value = $bindable(''),
		field,
		onSelect,
		placeholder = '',
		id = undefined
	}: {
		value?: string;
		field: 'firstName' | 'lastName';
		onSelect: (attendee: AttendeeRecord) => void;
		placeholder?: string;
		id?: string;
	} = $props();

	let suggestions: AttendeeRecord[] = $state([]);
	let showSuggestions = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();
	let lastFetchedQuery = '';

	$effect(() => {
		const query = value;

		if (query.length < 2) {
			suggestions = [];
			showSuggestions = false;
			lastFetchedQuery = '';
			return;
		}

		// Don't re-fetch if the query hasn't changed (e.g. parent re-render)
		if (query === lastFetchedQuery && suggestions.length > 0) {
			return;
		}

		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(
					`/api/attendees/search?q=${encodeURIComponent(query)}&field=${encodeURIComponent(field)}`
				);
				if (!res.ok) {
					suggestions = [];
					showSuggestions = false;
					return;
				}
				const data = await res.json();
				suggestions = data.suggestions ?? [];
				showSuggestions = suggestions.length > 0;
				lastFetchedQuery = query;
			} catch {
				suggestions = [];
				showSuggestions = false;
			}
		}, 300);

		return () => clearTimeout(timeout);
	});

	function handleSelect(attendee: AttendeeRecord) {
		showSuggestions = false;
		onSelect(attendee);
	}

	function handleBlur() {
		// Small delay to allow click events on suggestions to fire
		setTimeout(() => {
			showSuggestions = false;
		}, 200);
	}

	function handleFocus() {
		if (suggestions.length > 0 && value.length >= 2) {
			showSuggestions = true;
		}
	}
</script>

<div class="attendee-autofill">
	<input
		bind:this={inputEl}
		type="text"
		bind:value
		{id}
		{placeholder}
		aria-label={placeholder}
		autocomplete="off"
		onfocus={handleFocus}
		onblur={handleBlur}
	/>
	{#if showSuggestions}
		<ul class="suggestions" role="listbox">
			{#each suggestions as attendee (attendee.id)}
				<li role="option" aria-selected="false">
					<button
						type="button"
						class="suggestion-item"
						onmousedown={() => handleSelect(attendee)}
					>
						{attendee.firstName} {attendee.lastName}
						<span class="suggestion-id-type">{attendee.idType}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.attendee-autofill {
		position: relative;
		width: 100%;
	}

	input[type='text'] {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}

	input[type='text']:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		background: #fff;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
		max-height: 240px;
		overflow-y: auto;
		margin-top: 2px;
	}

	.suggestions li {
		margin: 0;
		padding: 0;
	}

	.suggestion-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		background: none;
		font-size: 0.875rem;
		color: #111827;
		cursor: pointer;
		text-align: left;
	}

	.suggestion-item:hover {
		background-color: #f3f4f6;
	}

	.suggestion-id-type {
		font-size: 0.8rem;
		color: #6b7280;
		margin-left: 0.5rem;
		flex-shrink: 0;
	}
</style>
