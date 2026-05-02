<script lang="ts">
	let {
		value = '',
		placeholder = 'Search...',
		onSearch
	}: {
		value?: string;
		placeholder?: string;
		onSearch: (term: string) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let inputValue = $state(value);

	$effect(() => {
		const currentValue = inputValue;
		const timeout = setTimeout(() => {
			onSearch(currentValue);
		}, 300);
		return () => clearTimeout(timeout);
	});
</script>

<div class="search-filter">
	<input
		type="search"
		aria-label={placeholder}
		{placeholder}
		bind:value={inputValue}
	/>
</div>

<style>
	.search-filter {
		display: inline-block;
	}

	input[type='search'] {
		padding: 0.45rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		width: 100%;
		min-width: 200px;
		outline: none;
		transition: border-color 0.15s;
	}

	input[type='search']:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}
</style>
