<!-- src/lib/features/spawnpoints/components/SpawnpointDetail.svelte -->
<script lang="ts">
	import { spawnpointState } from '../stores/spawnpointState.svelte';
	import { relativeTime } from '$lib/utils/time';
	import type { Area } from '$lib/features/area-management/types';

	let { area }: { area: Area } = $props();

	const spawnEntry = $derived(spawnpointState.counts[area.id]);
	const spawnLoading = $derived(spawnpointState.loadingIds.has(area.id));
</script>

<div class="spawn-section">
	<span class="field-label">
		Spawnpoints
		<span class="field-hint">({spawnpointState.mode})</span>
	</span>
	{#if spawnEntry}
		<div class="spawn-detail-row">
			<span class="spawn-count-val">{spawnEntry.count.toLocaleString()}</span>
			<span class="spawn-updated">Updated {relativeTime(spawnEntry.fetchedAt)}</span>
			{#if spawnpointState.canFetch}
				<button
					class="btn-fetch-now"
					class:loading={spawnLoading}
					onclick={() => spawnpointState.fetchArea(area.id, area.geofence)}
					disabled={spawnLoading}
					title="Refresh count">↻</button
				>
			{/if}
		</div>
	{:else if spawnLoading}
		<span class="spawn-hint">Fetching…</span>
	{:else}
		<div class="spawn-detail-row">
			<span class="spawn-hint">Not yet loaded</span>
			{#if spawnpointState.canFetch}
				<button
					class="btn-fetch-now"
					onclick={() => spawnpointState.fetchArea(area.id, area.geofence)}
					title="Fetch count">Fetch</button
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.spawn-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.spawn-detail-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.spawn-count-val {
		font-size: var(--text-md);
		font-weight: 700;
		color: var(--success);
	}

	.spawn-updated {
		font-size: var(--text-xs);
		color: var(--text-muted);
		flex: 1;
	}

	.spawn-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.btn-fetch-now {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.2rem 0.5rem;
		border-radius: 5px;
		cursor: pointer;
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.25);
		color: var(--success);
		transition: background 0.15s;
	}

	.btn-fetch-now:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.18);
	}
	.btn-fetch-now:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.btn-fetch-now.loading {
		animation: spawn-pulse 1s ease-in-out infinite;
	}

	@keyframes spawn-pulse {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 0.9;
		}
	}

	.field-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-muted);
	}

	.field-hint {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-muted);
		font-size: 0.85em;
	}
</style>
