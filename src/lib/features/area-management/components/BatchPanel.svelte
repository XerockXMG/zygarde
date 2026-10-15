<!-- src/lib/features/area-management/components/BatchPanel.svelte -->
<script lang="ts">
	/**
	 * Batch mode UI — selection bar, inline worker form, and the full-screen
	 * generation queue overlay. Rendered by AreaList directly after FilterBar.
	 *
	 * The generation overlay is `position: absolute; inset: 0`, so it fills
	 * its nearest positioned ancestor — the `.list-panel` in +page.svelte
	 * (AreaList's own root div is deliberately left `position: static`).
	 */
	import { batchState } from '../stores/batchState.svelte';
	import { routeState } from '../stores/routeState.svelte';
	import type { Area } from '../types';

	let { filteredAreas }: { filteredAreas: Area[] } = $props();
</script>

{#if batchState.batchMode}
	<div class="batch-bar">
		<div class="batch-bar-row">
			<span class="batch-count">{batchState.batchSelectedIds.size} selected</span>

			<button
				class="batch-bar-btn"
				onclick={() => {
					batchState.batchSelectedIds = new Set(
						filteredAreas.filter((a) => a.geofence).map((a) => a.id)
					);
					batchState.batchWorkerDone = false;
				}}>All</button
			>

			<button
				class="batch-bar-btn"
				onclick={() => {
					batchState.batchSelectedIds = new Set();
					batchState.batchWorkerDone = false;
				}}>None</button
			>
		</div>

		<div class="batch-bar-row">
			<button
				class="batch-bar-btn batch-bar-btn--accent"
				disabled={batchState.batchSelectedIds.size === 0}
				aria-pressed={batchState.showBatchWorkers}
				onclick={() => batchState.toggleBatchForm('workers')}>⚙ Workers</button
			>

			<button
				class="batch-bar-btn batch-bar-btn--target"
				disabled={batchState.batchSelectedIds.size === 0}
				aria-pressed={batchState.showBatchTarget}
				onclick={() => batchState.toggleBatchForm('target')}>⚖ Target</button
			>

			<button
				class="batch-bar-btn batch-bar-btn--autoscale"
				disabled={batchState.batchSelectedIds.size === 0}
				aria-pressed={batchState.showBatchAutoscale}
				onclick={() => batchState.toggleBatchForm('autoscale')}>⚡ Autoscale</button
			>

			<button
				class="batch-bar-btn batch-bar-btn--primary"
				disabled={batchState.batchSelectedIds.size === 0}
				onclick={() => batchState.openBatchPanel(filteredAreas)}>⊕ Routes</button
			>
		</div>
	</div>

	{#if batchState.showBatchWorkers}
		<div class="batch-worker-form">
			<span class="batch-worker-title">
				Set workers for {batchState.batchSelectedIds.size} area{batchState.batchSelectedIds.size ===
				1
					? ''
					: 's'}
			</span>

			<div class="batch-worker-grid">
				<label class="gen-label">
					<span class="gen-tag">Pokemon</span>
					<input
						class="gen-input"
						type="number"
						min="0"
						bind:value={batchState.batchWorkerPokemon}
					/>
				</label>
				<label class="gen-label">
					<span class="gen-tag">Fort</span>
					<input class="gen-input" type="number" min="0" bind:value={batchState.batchWorkerFort} />
				</label>
				<label class="gen-label">
					<span class="gen-tag">Quest</span>
					<input class="gen-input" type="number" min="0" bind:value={batchState.batchWorkerQuest} />
				</label>
				<label class="gen-label">
					<span class="gen-tag">Rare</span>
					<input class="gen-input" type="number" min="0" bind:value={batchState.batchWorkerRare} />
				</label>
			</div>

			<div class="gen-actions">
				{#if batchState.batchWorkerDone}
					<span class="batch-worker-done">✓ Applied</span>
				{/if}
				<button
					class="btn-generate"
					disabled={batchState.batchSelectedIds.size === 0 || batchState.batchWorkerSaving}
					onclick={() => batchState.runBatchWorkers()}
				>
					{batchState.batchWorkerSaving
						? 'Saving…'
						: `Apply to ${batchState.batchSelectedIds.size} area${batchState.batchSelectedIds.size === 1 ? '' : 's'}`}
				</button>
			</div>
		</div>
	{/if}

	{#if batchState.showBatchTarget}
		<div class="batch-target-form">
			<span class="batch-worker-title">
				Set token target for {batchState.batchSelectedIds.size} area{batchState.batchSelectedIds
					.size === 1
					? ''
					: 's'}
			</span>

			<div class="batch-target-row">
				<label class="gen-label">
					<span class="gen-tag">Mode</span>
					<select class="gen-select" bind:value={batchState.batchTargetMode}>
						<option value="static">Static number</option>
						<option value="workers">Based on Pokemon workers</option>
					</select>
				</label>

				{#if batchState.batchTargetMode === 'static'}
					<label class="gen-label">
						<span class="gen-tag">Value</span>
						<input
							class="gen-input"
							type="number"
							min="0"
							bind:value={batchState.batchTargetStaticValue}
						/>
					</label>
				{:else}
					<label class="gen-label">
						<span class="gen-tag">Workers/token override</span>
						<input
							class="gen-input"
							type="number"
							min="1"
							placeholder="global default"
							bind:value={batchState.batchTargetWorkersPerTokenOverride}
						/>
					</label>
				{/if}
			</div>

			<div class="gen-actions">
				{#if batchState.batchTargetDone}
					<span class="batch-worker-done">✓ Applied</span>
				{/if}
				<button
					class="btn-generate"
					disabled={batchState.batchSelectedIds.size === 0 || batchState.batchTargetSaving}
					onclick={() => batchState.runBatchTarget()}
				>
					{batchState.batchTargetSaving
						? 'Saving…'
						: `Apply to ${batchState.batchSelectedIds.size} area${batchState.batchSelectedIds.size === 1 ? '' : 's'}`}
				</button>
			</div>
		</div>
	{/if}

	{#if batchState.showBatchAutoscale}
		<div class="batch-autoscale-form">
			<span class="batch-worker-title">
				Autoscale for {batchState.batchSelectedIds.size} area{batchState.batchSelectedIds.size === 1
					? ''
					: 's'}
			</span>

			<p class="batch-autoscale-hint">
				Enabling snapshots each area's current Pokemon worker count as its max and requires a token
				target already be set — areas without one are skipped. Disabling restores each area to its
				stored max.
			</p>

			{#if batchState.batchAutoscaleResult}
				<span class="batch-worker-done">
					✓ {batchState.batchAutoscaleResult.action === 'enable' ? 'Enabled' : 'Disabled'}
					{batchState.batchAutoscaleResult.succeeded}
				</span>
				{#if batchState.batchAutoscaleResult.failed.length > 0}
					<span class="batch-autoscale-failed">
						Skipped: {batchState.batchAutoscaleResult.failed.join(', ')}
					</span>
				{/if}
			{/if}

			<div class="gen-actions">
				<button
					class="btn-generate"
					disabled={batchState.batchSelectedIds.size === 0 || batchState.batchAutoscaleSaving}
					onclick={() => batchState.runBatchEnableAutoscale(filteredAreas)}
				>
					{batchState.batchAutoscaleSaving
						? 'Working…'
						: `Enable for ${batchState.batchSelectedIds.size}`}
				</button>
				<button
					class="btn-generate btn-generate--danger"
					disabled={batchState.batchSelectedIds.size === 0 || batchState.batchAutoscaleSaving}
					onclick={() => batchState.runBatchDisableAutoscale(filteredAreas)}
				>
					{batchState.batchAutoscaleSaving
						? 'Working…'
						: `Disable for ${batchState.batchSelectedIds.size}`}
				</button>
			</div>
		</div>
	{/if}
{/if}

{#if batchState.showBatchPanel}
	<div class="batch-panel">
		<div class="batch-panel-header">
			{#if !batchState.batchRunning}
				<button
					class="batch-panel-back"
					onclick={() => batchState.backToBatchList()}
					title="Back to the area list (keeps your selection)">← Back</button
				>
			{/if}
			<span class="batch-panel-title">Batch Route Generation</span>
			{#if !batchState.batchRunning}
				<button
					class="batch-panel-close"
					onclick={() => batchState.closeBatchPanel()}
					title="Exit batch mode">✕</button
				>
			{/if}
		</div>

		{#if !batchState.batchRunning && batchState.batchQueue.every((q) => q.status === 'pending')}
			<div class="batch-params">
				<div class="route-type-toggle">
					<button
						class="route-type-btn"
						class:active={routeState.genRouteType === 'spawnpoint'}
						onclick={() => (routeState.genRouteType = 'spawnpoint')}>Spawnpoint</button
					>
					<button
						class="route-type-btn"
						class:active={routeState.genRouteType === 'bootstrap'}
						onclick={() => (routeState.genRouteType = 'bootstrap')}>Bootstrap</button
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
									<span class="cluster-hint">/ worker · auto per area</span>
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
			</div>
		{/if}

		<div class="batch-queue">
			{#each batchState.batchQueue as item}
				<div class="batch-item batch-item--{item.status}">
					<span class="batch-item-icon">
						{#if item.status === 'pending'}○
						{:else if item.status === 'running'}<span class="batch-spinner">◌</span>
						{:else if item.status === 'done'}✓
						{:else if item.status === 'error'}✕
						{:else if item.status === 'skipped'}—
						{/if}
					</span>
					<span class="batch-item-name">{item.area.name}</span>
					<span class="batch-item-detail">
						{#if item.status === 'running'}{item.elapsed}s
						{:else if item.status === 'done'}{item.stops} stops
						{:else if item.status === 'error'}
							<span class="batch-item-error" title={item.message}>error</span>
						{:else if item.status === 'skipped'}no geofence
						{/if}
					</span>
				</div>
			{/each}
		</div>

		<div class="batch-panel-footer">
			{#if batchState.batchRunning}
				<span class="batch-progress">
					{batchState.batchQueue.filter(
						(q) => q.status === 'done' || q.status === 'error' || q.status === 'skipped'
					).length} / {batchState.batchQueue.length} complete
				</span>
				<button class="btn-discard" disabled>Running…</button>
			{:else if batchState.batchQueue.length > 0 && batchState.batchQueue.every((q) => q.status !== 'pending' && q.status !== 'running')}
				<span class="batch-progress">
					{batchState.batchQueue.filter((q) => q.status === 'done').length} succeeded ·
					{batchState.batchQueue.filter((q) => q.status === 'error').length} failed
				</span>
				<button class="btn-save-route" onclick={() => batchState.closeBatchPanel()}>✓ Done</button>
			{:else}
				<span class="batch-progress">
					{batchState.batchQueue.length} area{batchState.batchQueue.length === 1 ? '' : 's'} queued
				</span>
				<button
					class="btn-generate"
					disabled={batchState.batchRunning}
					onclick={() => batchState.runBatchGeneration()}>▶ Start</button
				>
			{/if}
		</div>
	</div>
{/if}

<style>
	.batch-bar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 6px 10px;
		background: rgba(56, 189, 248, 0.07);
		border-bottom: 1px solid rgba(56, 189, 248, 0.2);
		flex-shrink: 0;
	}

	.batch-bar-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.batch-count {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin-right: 2px;
		min-width: 60px;
	}

	.batch-bar-btn {
		padding: 3px 9px;
		font-size: var(--text-xs);
		font-weight: 600;
		border-radius: 5px;
		border: 1px solid #1a2540;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}

	/* The batch form that's currently open. */
	.batch-bar-btn[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.08);
	}

	.batch-bar-btn:hover:not(:disabled) {
		border-color: #475569;
		color: var(--text);
	}

	.batch-bar-btn--accent {
		border-color: #a78bfa;
		color: var(--violet);
	}

	.batch-bar-btn--accent:hover:not(:disabled) {
		background: rgba(167, 139, 250, 0.1);
	}

	.batch-bar-btn--primary {
		border-color: #10b981;
		color: var(--success);
	}

	.batch-bar-btn--primary:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.12);
	}

	.batch-bar-btn--target {
		border-color: #fbbf24;
		color: var(--warning);
	}

	.batch-bar-btn--target:hover:not(:disabled) {
		background: rgba(251, 191, 36, 0.12);
	}

	.batch-bar-btn--autoscale {
		border-color: #38bdf8;
		color: var(--accent);
	}

	.batch-bar-btn--autoscale:hover:not(:disabled) {
		background: rgba(56, 189, 248, 0.12);
	}

	.batch-bar-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.batch-worker-form {
		padding: 10px 12px;
		background: rgba(167, 139, 250, 0.05);
		border-bottom: 1px solid rgba(167, 139, 250, 0.2);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.batch-target-form {
		padding: 10px 12px;
		background: rgba(251, 191, 36, 0.05);
		border-bottom: 1px solid rgba(251, 191, 36, 0.2);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.batch-target-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px;
	}

	.batch-autoscale-form {
		padding: 10px 12px;
		background: rgba(56, 189, 248, 0.05);
		border-bottom: 1px solid rgba(56, 189, 248, 0.2);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.batch-autoscale-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
	}

	.batch-autoscale-failed {
		font-size: var(--text-xs);
		color: var(--token);
	}

	.batch-worker-title {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		font-weight: 600;
	}

	.batch-worker-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}

	.batch-worker-done {
		font-size: var(--text-xs);
		color: var(--success);
		font-weight: 600;
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
		align-items: center;
	}

	.btn-generate {
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.4rem 0.85rem;
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

	.btn-generate--danger {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.4);
		color: var(--danger);
	}

	.btn-generate--danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.2);
	}

	.btn-discard {
		font-size: var(--text-sm);
		font-weight: 700;
		padding: 0.4rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		background: transparent;
		border: 1px solid #334155;
		color: var(--text-muted);
	}

	.btn-discard:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-save-route {
		font-size: var(--text-sm);
		font-weight: 700;
		padding: 0.4rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		background: rgba(16, 185, 129, 0.12);
		border: 1px solid #10b981;
		color: var(--success);
	}

	.btn-save-route:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.25);
	}

	.batch-panel {
		position: absolute;
		inset: 0;
		z-index: 50;
		background: #0d1425;
		display: flex;
		flex-direction: column;
		border: 1px solid #1a2540;
		border-radius: 8px;
		overflow: hidden;
	}

	.batch-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		border-bottom: 1px solid #1a2540;
		flex-shrink: 0;
	}

	.batch-panel-back {
		padding: 3px 9px;
		font-size: var(--text-xs);
		font-weight: 600;
		border-radius: 5px;
		border: 1px solid #1a2540;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.batch-panel-back:hover {
		border-color: #475569;
		color: var(--text);
	}

	.batch-panel-title {
		flex: 1;
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--text);
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.batch-panel-close {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: var(--text-md);
		padding: 2px 6px;
	}

	.batch-panel-close:hover {
		color: var(--text-secondary);
	}

	.batch-params {
		padding: 10px 12px;
		border-bottom: 1px solid #1a2540;
		flex-shrink: 0;
	}

	.route-type-toggle {
		display: flex;
		background: #070b14;
		border: 1px solid #1a2540;
		border-radius: 7px;
		padding: 0.2rem;
		margin-bottom: 0.5rem;
	}

	.route-type-btn {
		flex: 1;
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		padding: 0.32rem 0.5rem;
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
		gap: 0.5rem;
	}

	.cluster-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.batch-queue {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.batch-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 14px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
		font-size: var(--text-sm);
	}

	.batch-item-icon {
		width: 16px;
		text-align: center;
		flex-shrink: 0;
	}

	.batch-item--pending .batch-item-icon {
		color: var(--text-muted);
	}
	.batch-item--running .batch-item-icon {
		color: var(--warning);
	}
	.batch-item--done .batch-item-icon {
		color: var(--success);
	}
	.batch-item--error .batch-item-icon {
		color: var(--danger);
	}
	.batch-item--skipped .batch-item-icon {
		color: var(--text-muted);
	}

	.batch-item-name {
		flex: 1;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.batch-item--running .batch-item-name {
		color: var(--text);
		font-weight: 600;
	}
	.batch-item--done .batch-item-name {
		color: var(--text-secondary);
	}
	.batch-item--skipped .batch-item-name {
		color: var(--text-muted);
	}

	.batch-item-detail {
		font-size: 0.88em;
		color: var(--text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.batch-item--running .batch-item-detail {
		color: var(--warning);
	}
	.batch-item--done .batch-item-detail {
		color: var(--success);
	}
	.batch-item-error {
		color: var(--danger);
	}

	.batch-panel-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-top: 1px solid #1a2540;
		flex-shrink: 0;
		gap: 8px;
	}

	.batch-progress {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	@keyframes batch-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.batch-spinner {
		display: inline-block;
		animation: batch-spin 1.2s linear infinite;
	}
</style>
