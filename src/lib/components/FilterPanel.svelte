<script lang="ts">
	interface FilterOption {
		value: string;
		label: string;
	}

	interface FilterConfig {
		key: string;
		label: string;
		type: 'text' | 'select' | 'date' | 'toggle';
		options?: FilterOption[];
		placeholder?: string;
	}

	let {
		filters,
		values,
		onChange
	}: {
		filters: FilterConfig[];
		values: Record<string, any>;
		onChange: (values: Record<string, any>) => void;
	} = $props();

	function handleChange(key: string, value: any) {
		onChange({ ...values, [key]: value });
	}

	function handleInputChange(key: string, e: Event) {
		const target = e.target as HTMLInputElement;
		handleChange(key, target.value);
	}

	function handleSelectChange(key: string, e: Event) {
		const target = e.target as HTMLSelectElement;
		handleChange(key, target.value);
	}

	function handleToggleChange(key: string, e: Event) {
		const target = e.target as HTMLInputElement;
		handleChange(key, target.checked);
	}
</script>

<fieldset class="filter-panel">
	<legend class="sr-only">Filters</legend>
	<div class="filter-grid">
		{#each filters as filter (filter.key)}
			<div class="filter-field">
				<label for="filter-{filter.key}">{filter.label}</label>

				{#if filter.type === 'text'}
					<input
						id="filter-{filter.key}"
						type="text"
						placeholder={filter.placeholder ?? ''}
						value={values[filter.key] ?? ''}
						oninput={(e) => handleInputChange(filter.key, e)}
					/>
				{:else if filter.type === 'select'}
					<select
						id="filter-{filter.key}"
						value={values[filter.key] ?? ''}
						onchange={(e) => handleSelectChange(filter.key, e)}
					>
						<option value="">All</option>
						{#each filter.options ?? [] as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				{:else if filter.type === 'date'}
					<input
						id="filter-{filter.key}"
						type="date"
						value={values[filter.key] ?? ''}
						onchange={(e) => handleInputChange(filter.key, e)}
					/>
				{:else if filter.type === 'toggle'}
					<label class="toggle-label" for="filter-{filter.key}">
						<input
							id="filter-{filter.key}"
							type="checkbox"
							class="toggle-input"
							checked={values[filter.key] ?? false}
							onchange={(e) => handleToggleChange(filter.key, e)}
						/>
						<span class="toggle-track">
							<span class="toggle-thumb"></span>
						</span>
					</label>
				{/if}
			</div>
		{/each}
	</div>
</fieldset>

<style>
	.filter-panel {
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1rem;
		background-color: #fafafa;
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
		border: 0;
	}

	.filter-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 160px;
		flex: 1 1 180px;
	}

	.filter-field > label {
		font-size: 0.8rem;
		font-weight: 600;
		color: #4b5563;
	}

	input[type='text'],
	input[type='date'],
	select {
		padding: 0.4rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.875rem;
		background: #fff;
		outline: none;
		transition: border-color 0.15s;
	}

	input[type='text']:focus,
	input[type='date']:focus,
	select:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.toggle-label {
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		padding-top: 0.2rem;
	}

	.toggle-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-track {
		position: relative;
		display: inline-block;
		width: 40px;
		height: 22px;
		background-color: #d1d5db;
		border-radius: 11px;
		transition: background-color 0.2s;
	}

	.toggle-input:checked + .toggle-track {
		background-color: #6366f1;
	}

	.toggle-input:focus-visible + .toggle-track {
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		background-color: #fff;
		border-radius: 50%;
		transition: transform 0.2s;
	}

	.toggle-input:checked + .toggle-track .toggle-thumb {
		transform: translateX(18px);
	}

	@media (max-width: 600px) {
		.filter-grid {
			flex-direction: column;
		}

		.filter-field {
			min-width: 100%;
		}
	}
</style>
