<script lang="ts">
	/**
	 * Collapsible, combinable list-filter criteria beyond FilterBar's
	 * ALL/Enabled/Disabled tabs — token funding status, a worker-count range
	 * (by mode), and route-generation freshness. All three narrow the list
	 * together (AND), each independently optional. Admin-only: worker counts
	 * and route-generation data aren't shown to non-admin viewers elsewhere
	 * on this page either.
	 */
	import type {
		Permissions,
		CriteriaFilters,
		RouteFreshnessFilter,
		RouteTypeFilter,
		TokenFundingFilter,
		WorkerModeKey
	} from '../types';
	import { DEFAULT_CRITERIA_FILTERS } from '../types';

	let {
		permissions,
		criteriaFilters = $bindable()
	}: { permissions: Permissions; criteriaFilters: CriteriaFilters } = $props();

	let expanded = $state(false);

	const activeCount = $derived(
		(criteriaFilters.tokenFunding !== 'ANY' ? 1 : 0) +
			(criteriaFilters.workerMin !== null || criteriaFilters.workerMax !== null ? 1 : 0) +
			(criteriaFilters.routeFreshness !== 'ANY' ? 1 : 0)
	);

	function reset(): void {
		criteriaFilters = { ...DEFAULT_CRITERIA_FILTERS };
	}

	function updateWorkerBound(field: 'workerMin' | 'workerMax', raw: string): void {
		const trimmed = raw.trim();
		const value = trimmed === '' ? null : Math.max(0, Number(trimmed));
		criteriaFilters = { ...criteriaFilters, [field]: value };
	}
</script>

{#if permissions.canEdit}
	<div class="filter-panel">
		<button class="panel-toggle" onclick={() => (expanded = !expanded)}>
			<span>Filters</span>
			{#if activeCount > 0}
				<span class="active-badge">{activeCount}</span>
			{/if}
			<span class="chevron">{expanded ? '▾' : '▸'}</span>
		</button>

		{#if expanded}
			<div class="panel-body">
				<div class="filter-group">
					<span class="group-label">Token funding</span>
					<select
						class="bar-select"
						value={criteriaFilters.tokenFunding}
						onchange={(e) =>
							(criteriaFilters = {
								...criteriaFilters,
								tokenFunding: (e.target as HTMLSelectElement).value as TokenFundingFilter
							})}
					>
						<option value="ANY">Any</option>
						<option value="UNDER">Under target</option>
						<option value="MEETING">Meeting target</option>
						<option value="ABOVE">Above target</option>
					</select>
				</div>

				<div class="filter-group">
					<span class="group-label">Worker count</span>
					<select
						class="bar-select"
						value={criteriaFilters.workerMode}
						onchange={(e) =>
							(criteriaFilters = {
								...criteriaFilters,
								workerMode: (e.target as HTMLSelectElement).value as WorkerModeKey
							})}
					>
						<option value="pokemon_mode">Pokemon</option>
						<option value="fort_mode">Fort</option>
						<option value="quest_mode">Quest</option>
						<option value="rare_pokemon_mode">Rare</option>
					</select>
					<input
						class="range-input"
						type="number"
						min="0"
						placeholder="Min"
						value={criteriaFilters.workerMin ?? ''}
						oninput={(e) => updateWorkerBound('workerMin', (e.target as HTMLInputElement).value)}
					/>
					<span class="range-sep">–</span>
					<input
						class="range-input"
						type="number"
						min="0"
						placeholder="Max"
						value={criteriaFilters.workerMax ?? ''}
						oninput={(e) => updateWorkerBound('workerMax', (e.target as HTMLInputElement).value)}
					/>
				</div>

				<div class="filter-group">
					<span class="group-label">Route last updated</span>
					<select
						class="bar-select"
						value={criteriaFilters.routeType}
						onchange={(e) =>
							(criteriaFilters = {
								...criteriaFilters,
								routeType: (e.target as HTMLSelectElement).value as RouteTypeFilter
							})}
					>
						<option value="spawnpoint">Pokemon route</option>
						<option value="bootstrap">Fort route</option>
					</select>
					<select
						class="bar-select"
						value={criteriaFilters.routeFreshness}
						onchange={(e) =>
							(criteriaFilters = {
								...criteriaFilters,
								routeFreshness: (e.target as HTMLSelectElement).value as RouteFreshnessFilter
							})}
					>
						<option value="ANY">Any time</option>
						<option value="WITHIN_7D">Within 7 days</option>
						<option value="WITHIN_30D">Within 30 days</option>
						<option value="WITHIN_90D">Within 90 days</option>
						<option value="STALE_90D">Over 90 days ago</option>
						<option value="NEVER">Never generated</option>
					</select>
				</div>

				{#if activeCount > 0}
					<button class="reset-btn" onclick={reset}>Reset filters</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.filter-panel {
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.panel-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.5rem 0.7rem;
		cursor: pointer;
	}

	.panel-toggle:hover {
		color: var(--text-secondary);
	}

	.active-badge {
		font-size: var(--text-xs);
		background: rgba(56, 189, 248, 0.15);
		color: var(--accent);
		padding: 0.05rem 0.4rem;
		border-radius: 8px;
	}

	.chevron {
		margin-left: auto;
	}

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0 0.7rem 0.7rem;
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.group-label {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		width: 100%;
	}

	.bar-select {
		appearance: none;
		-webkit-appearance: none;
		background: #070b14
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23334155'/%3E%3C/svg%3E")
			no-repeat right 8px center;
		border: 1px solid #1a2540;
		border-radius: 5px;
		color: var(--text-secondary);
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

	.range-input {
		width: 3.5rem;
		background: #070b14;
		border: 1px solid #1a2540;
		border-radius: 5px;
		color: var(--text);
		font-size: var(--text-xs);
		padding: 5px 6px;
	}

	.range-sep {
		color: var(--text-muted);
	}

	.reset-btn {
		align-self: flex-start;
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

	.reset-btn:hover {
		border-color: #ef4444;
		color: var(--danger);
	}
</style>
