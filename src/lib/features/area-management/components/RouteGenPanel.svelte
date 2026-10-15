<!-- src/lib/features/area-management/components/RouteGenPanel.svelte -->
<script lang="ts">
	/**
	 * Kōji route generation panel for a single area, rendered inside
	 * AreaCard's admin detail panel. Shows the current route's stop count,
	 * and either an "open panel" button, the parameters form, a generating
	 * spinner, or a preview-confirm state — all driven by `routeState`.
	 */
	import { routeState } from '../stores/routeState.svelte';
	import { mapState } from '$lib/features/map/stores/mapState.svelte';
	import { relativeTime } from '$lib/utils/time';
	import type { Area } from '../types';
	import type { RouteRunsByArea } from '../server/routeRuns';

	let { area, routeRuns }: { area: Area; routeRuns: RouteRunsByArea[number] | undefined } =
		$props();

	const isPanelOpen = $derived(routeState.routePanelAreaId === area.id);
	const isGenerating = $derived(routeState.generating && routeState.routePanelAreaId === area.id);
	const hasPreview = $derived(routeState.previewRoute?.areaId === area.id);
</script>

<div class="route-section">
	<div class="route-header">
		<span class="field-label">Pokemon Route</span>
		<span class="route-status">
			{#if area.pokemon_mode.route.length > 0}
				{area.pokemon_mode.route.length} stops
			{:else}
				<span class="route-none">None</span>
			{/if}
		</span>
	</div>

	{#if routeRuns?.spawnpoint || routeRuns?.bootstrap}
		<div class="route-run-history">
			{#if routeRuns.spawnpoint}
				<span
					class="route-run-item"
					title={new Date(routeRuns.spawnpoint.generatedAt).toLocaleString()}
				>
					Spawn: <b>{relativeTime(routeRuns.spawnpoint.generatedAt)}</b> ·
					{routeRuns.spawnpoint.stopCount.toLocaleString()} stops
				</span>
			{/if}
			{#if routeRuns.bootstrap}
				<span
					class="route-run-item"
					title={new Date(routeRuns.bootstrap.generatedAt).toLocaleString()}
				>
					Bootstrap: <b>{relativeTime(routeRuns.bootstrap.generatedAt)}</b> ·
					{routeRuns.bootstrap.stopCount.toLocaleString()} stops
				</span>
			{/if}
		</div>
	{/if}

	{#if hasPreview}
		<div class="route-preview-info">
			<span class="route-preview-badge">⬥ Preview on map</span>
			<span class="route-stat">{routeState.previewRoute!.coords.length} stops</span>
			{#if routeState.previewRoute!.stats?.best_route_distance}
				<span class="route-stat">
					{(routeState.previewRoute!.stats.best_route_distance / 1000).toFixed(1)} km
				</span>
			{/if}
		</div>
		{#if routeState.genError}
			<p class="gen-error">{routeState.genError}</p>
		{/if}
		<div class="route-preview-actions">
			<button
				class="btn-discard"
				onclick={() => routeState.discardRoute(mapState.previewRouteGroup)}>✕ Discard</button
			>
			<button
				class="btn-save-route"
				disabled={routeState.savingRoute}
				onclick={() => routeState.saveRoute(area.id, routeState.previewRoute!.cacheKey)}
			>
				{routeState.savingRoute ? 'Saving…' : '✓ Save Route'}
			</button>
		</div>
	{:else if isGenerating}
		<div class="route-generating">
			<span class="route-spinner">◌</span>
			Generating route…
			<span class="gen-elapsed">{routeState.genElapsed}s</span>
		</div>
	{:else if isPanelOpen}
		<div class="route-gen-panel">
			<div class="route-type-toggle">
				<button
					class="route-type-btn"
					class:active={routeState.genRouteType === 'spawnpoint'}
					onclick={() => {
						routeState.genRouteType = 'spawnpoint';
						routeState.genError = null;
					}}>Spawnpoint</button
				>
				<button
					class="route-type-btn"
					class:active={routeState.genRouteType === 'bootstrap'}
					onclick={() => {
						routeState.genRouteType = 'bootstrap';
						routeState.genError = null;
					}}>Bootstrap</button
				>
			</div>

			<div class="gen-grid">
				<label class="gen-label">
					<span class="gen-tag">Radius (m)</span>
					<input
						class="gen-input"
						type="number"
						min="10"
						max="900"
						bind:value={routeState.genRadius}
					/>
				</label>

				{#if routeState.genRouteType !== 'bootstrap'}
					<label class="gen-label">
						<span class="gen-tag">Min Points</span>
						<input class="gen-input" type="number" min="1" bind:value={routeState.genMinPoints} />
					</label>

					<div class="gen-label" style="grid-column: span 2">
						<div class="gen-tag-row">
							<span class="gen-tag">Max Clusters</span>
							<div class="cluster-mode-btns">
								<button
									class="cluster-mode-btn"
									class:active={routeState.genClustersMode === 'fixed'}
									onclick={() => (routeState.genClustersMode = 'fixed')}>Fixed</button
								>
								<button
									class="cluster-mode-btn"
									class:active={routeState.genClustersMode === 'per_worker'}
									onclick={() => (routeState.genClustersMode = 'per_worker')}>Per Worker</button
								>
							</div>
						</div>
						{#if routeState.genClustersMode === 'fixed'}
							<input
								class="gen-input"
								type="number"
								min="0"
								placeholder="∞"
								bind:value={routeState.genMaxClusters}
							/>
						{:else}
							<div class="per-worker-row">
								<input
									class="gen-input"
									type="number"
									min="1"
									bind:value={routeState.genClustersPerWorker}
								/>
								<span class="cluster-hint">
									/ worker
									{#if area.pokemon_mode.workers > 0}
										= <b
											>{(
												routeState.genClustersPerWorker * area.pokemon_mode.workers
											).toLocaleString()}</b
										>
									{:else}
										<span style="opacity:0.5">(0 workers)</span>
									{/if}
								</span>
							</div>
						{/if}
					</div>
				{/if}

				{#if routeState.genRouteType === 'spawnpoint'}
					<label class="gen-label" style="grid-column: span 2">
						<span class="gen-tag">Cluster Mode</span>
						<select class="gen-select" bind:value={routeState.genClusterMode}>
							{#each ['Honeycomb', 'Fastest', 'Fast', 'Balanced', 'Better', 'Best'] as m}
								<option>{m}</option>
							{/each}
						</select>
					</label>
					<label class="gen-label">
						<span class="gen-tag">Calc Mode</span>
						<select class="gen-select" bind:value={routeState.genCalcMode}>
							<option>Radius</option>
							<option>S2</option>
						</select>
					</label>
					<label class="gen-label">
						<span class="gen-tag">Spawnpoints</span>
						<select class="gen-select" bind:value={routeState.genTth}>
							<option>All</option>
							<option>Known</option>
							<option>Unknown</option>
						</select>
					</label>
				{/if}
			</div>

			{#if routeState.genError}
				<p class="gen-error">{routeState.genError}</p>
			{/if}

			<div class="gen-actions">
				<button
					class="btn-discard"
					onclick={() => {
						routeState.routePanelAreaId = null;
						routeState.genError = null;
					}}>✕ Cancel</button
				>
				<button
					class="btn-generate"
					disabled={!area.geofence || routeState.generating}
					onclick={() => routeState.generateRoute(area, (a) => mapState.focusArea(a))}
					>⊕ Generate</button
				>
			</div>
		</div>
	{:else}
		<button
			class="btn-open-route-panel"
			disabled={!area.geofence}
			title={!area.geofence ? 'Set a geofence first' : 'Generate a Pokemon route via Kōji'}
			onclick={() => routeState.openRoutePanel(area.id)}>⊕ Generate Route</button
		>
	{/if}
</div>

<style>
	.route-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.6rem;
		margin-top: 0.6rem;
		background: rgba(16, 185, 129, 0.04);
		border: 1px solid rgba(16, 185, 129, 0.2);
		border-radius: 8px;
	}

	.route-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.field-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.route-status {
		font-size: var(--text-xs);
		font-family: monospace;
		font-weight: 600;
		color: var(--success);
	}

	.route-none {
		color: var(--text-muted);
	}

	.route-run-history {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.route-run-item {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.route-run-item b {
		color: var(--success);
		font-weight: 700;
	}

	.btn-open-route-panel {
		align-self: flex-start;
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.4);
		color: var(--success);
	}

	.btn-open-route-panel:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.2);
	}

	.btn-open-route-panel:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.route-gen-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.route-type-toggle {
		display: flex;
		background: #070b14;
		border: 1px solid #1a2540;
		border-radius: 7px;
		padding: 0.2rem;
	}

	.route-type-btn {
		flex: 1;
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		padding: 0.3rem 0.5rem;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		background: transparent;
		color: var(--text-muted);
	}

	.route-type-btn.active {
		background: rgba(16, 185, 129, 0.15);
		color: var(--success);
	}

	.gen-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.gen-label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.gen-tag {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--success);
	}

	.gen-tag-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.cluster-mode-btns {
		display: flex;
		gap: 2px;
	}

	.cluster-mode-btn {
		background: transparent;
		border: 1px solid #1a2540;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		cursor: pointer;
	}

	.cluster-mode-btn.active {
		background: rgba(16, 185, 129, 0.12);
		border-color: #10b981;
		color: var(--success);
	}

	.per-worker-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.cluster-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.gen-input,
	.gen-select {
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 6px;
		color: var(--text);
		font-size: var(--text-sm);
		padding: 0.3rem 0.5rem;
		width: 100%;
		box-sizing: border-box;
		outline: none;
		cursor: default;
	}

	.gen-select {
		cursor: pointer;
	}

	.gen-input:focus,
	.gen-select:focus {
		border-color: #38bdf8;
	}

	.gen-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.btn-discard {
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		background: transparent;
		border: 1px solid #334155;
		color: var(--text-muted);
	}

	.btn-discard:hover:not(:disabled) {
		border-color: #475569;
		color: var(--text-secondary);
	}

	.btn-discard:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-generate {
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.4);
		color: var(--success);
	}

	.btn-generate:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.2);
	}

	.btn-generate:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.gen-error {
		font-size: var(--text-xs);
		color: var(--danger);
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.25);
		border-radius: 5px;
		padding: 0.35rem 0.55rem;
		margin: 0;
		line-height: 1.4;
	}

	.route-generating {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--success);
	}

	.gen-elapsed {
		font-family: monospace;
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin-left: auto;
	}

	.route-spinner {
		display: inline-block;
		animation: spin 1.1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.route-preview-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.route-preview-badge {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.03em;
		color: #f472b6;
		background: rgba(244, 114, 182, 0.12);
		border: 1px solid rgba(244, 114, 182, 0.3);
		border-radius: 5px;
		padding: 0.15rem 0.45rem;
	}

	.route-stat {
		font-size: var(--text-xs);
		font-family: monospace;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.route-preview-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.btn-save-route {
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		background: rgba(16, 185, 129, 0.12);
		border: 1px solid #10b981;
		color: var(--success);
	}

	.btn-save-route:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.25);
	}

	.btn-save-route:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
