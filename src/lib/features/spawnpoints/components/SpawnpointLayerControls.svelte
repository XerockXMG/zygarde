<script lang="ts">
	import { spawnpointState } from '../stores/spawnpointState.svelte';
	import type { Area, Permissions } from '$lib/features/area-management/types';

	let { permissions, areas }: { permissions: Permissions; areas: Area[] } = $props();

	$effect(() => {
		spawnpointState.init(permissions.canSeeSpawnpoints, permissions.canEdit, areas);
	});

	const spawnMode = $derived(spawnpointState.mode);
	const fetchingAll = $derived(spawnpointState.fetchingAll);
</script>

{#if spawnpointState.canSee}
	<div class="spawn-controls">
		<span class="controls-label">Spawns</span>
		<div class="spawn-mode-group">
			<button
				class="spawn-mode-btn"
				class:active={spawnMode === 'all'}
				onclick={() => spawnpointState.setMode('all')}>All</button
			>
			<button
				class="spawn-mode-btn"
				class:active={spawnMode === 'recent'}
				onclick={() => spawnpointState.setMode('recent')}>Recent</button
			>
			<button
				class="spawn-mode-btn"
				class:active={spawnMode === 'confirmed'}
				onclick={() => spawnpointState.setMode('confirmed')}>Confirmed</button
			>
		</div>
		{#if spawnpointState.canFetch}
			<button
				class="btn-fetch-all"
				class:loading={fetchingAll}
				onclick={() => spawnpointState.fetchAll()}
				disabled={fetchingAll}
				title="Refresh all spawnpoint counts">{fetchingAll ? '⟳' : 'Fetch All'}</button
			>
		{/if}
	</div>
{/if}

<style>
	.spawn-controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		border-left: 1px solid #1a2540;
		padding-left: 1rem;
	}

	.controls-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted);
		margin-right: 0.25rem;
	}

	.spawn-mode-group {
		display: flex;
		gap: 0.25rem;
	}

	.spawn-mode-btn {
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.22rem 0.55rem;
		border-radius: 5px;
		cursor: pointer;
		background: rgba(100, 116, 139, 0.08);
		border: 1px solid rgba(100, 116, 139, 0.25);
		color: var(--text-muted);
		transition:
			background 0.15s,
			color 0.15s;
	}

	.spawn-mode-btn:hover {
		background: rgba(100, 116, 139, 0.16);
		color: var(--text-secondary);
	}

	.spawn-mode-btn.active {
		background: rgba(56, 189, 248, 0.15);
		border-color: rgba(56, 189, 248, 0.4);
		color: var(--accent);
	}

	.btn-fetch-all {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.28rem 0.65rem;
		border-radius: 6px;
		cursor: pointer;
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.25);
		color: var(--success);
		transition: background 0.15s;
	}

	.btn-fetch-all:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.18);
	}
	.btn-fetch-all:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.btn-fetch-all.loading {
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
</style>
