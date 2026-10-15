<script lang="ts">
	import type { Area, Permissions, LayerFilter, SortMode } from '../types';
	import { batchState } from '../stores/batchState.svelte';

	let {
		areas,
		permissions,
		activeFilter,
		onFilterChange,
		sortMode,
		onSortChange
	}: {
		areas: Area[];
		permissions: Permissions;
		activeFilter: LayerFilter;
		onFilterChange: (f: LayerFilter) => void;
		sortMode: SortMode;
		onSortChange: (s: SortMode) => void;
	} = $props();

	const enabledCount = $derived(areas.filter((a) => a.enabled).length);
	const disabledCount = $derived(areas.filter((a) => !a.enabled).length);

	function handleSortChange(e: Event) {
		onSortChange((e.target as HTMLSelectElement).value as SortMode);
	}
</script>

<div class="filter-tabs">
	<button class="tab" class:active={activeFilter === 'ALL'} onclick={() => onFilterChange('ALL')}>
		ALL <span class="tab-count">{areas.length}</span>
	</button>
	<button
		class="tab"
		class:active={activeFilter === 'ENABLED'}
		onclick={() => onFilterChange('ENABLED')}
	>
		Enabled <span class="tab-count">{enabledCount}</span>
	</button>
	{#if permissions.canSeeOfflineAreas}
		<button
			class="tab"
			class:active={activeFilter === 'DISABLED'}
			onclick={() => onFilterChange('DISABLED')}
		>
			Disabled <span class="tab-count">{disabledCount}</span>
		</button>
	{/if}
</div>

<div class="sort-bar">
	<span class="bar-label">Sort</span>
	<select class="bar-select" value={sortMode} onchange={handleSortChange}>
		<option value="AZ">A–Z</option>
		<option value="VOTES">★ Tokens</option>
	</select>

	{#if permissions.canEdit}
		<button
			class="batch-toggle-btn"
			class:active={batchState.batchMode}
			onclick={() => batchState.toggleBatchMode()}
		>
			{batchState.batchMode ? '✕ Exit Batch' : '☑ Batch'}
		</button>
	{/if}
</div>

<style>
	.filter-tabs {
		display: flex;
		gap: 0.2rem;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 8px;
		padding: 0.25rem;
		flex-shrink: 0;
	}

	.tab {
		flex: 1;
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.55rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
	}

	.tab.active {
		background: #162040;
		color: var(--accent);
	}

	.tab-count {
		font-size: var(--text-xs);
		background: #162040;
		color: var(--text-muted);
		padding: 0.1rem 0.35rem;
		border-radius: 8px;
	}

	.tab.active .tab-count {
		background: rgba(56, 189, 248, 0.15);
		color: var(--accent);
	}

	.sort-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 2px;
		flex-shrink: 0;
	}

	.bar-label {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.bar-select {
		appearance: none;
		-webkit-appearance: none;
		background: #0d1425
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23334155'/%3E%3C/svg%3E")
			no-repeat right 8px center;
		border: 1px solid #1a2540;
		border-radius: 5px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 5px 26px 5px 10px;
		cursor: pointer;
		outline: none;
	}

	.bar-select option {
		color: var(--text);
		background: #0d1425;
	}

	.batch-toggle-btn {
		margin-left: auto;
		background: transparent;
		border: 1px solid #1a2540;
		border-radius: 5px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 5px 10px;
		cursor: pointer;
	}

	.batch-toggle-btn:hover {
		border-color: #475569;
		color: var(--text-secondary);
	}

	.batch-toggle-btn.active {
		background: rgba(56, 189, 248, 0.12);
		border-color: #38bdf8;
		color: var(--accent);
	}
</style>
