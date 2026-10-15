<script lang="ts">
	/**
	 * Map layer control strip — shown at the top of the map panel.
	 *
	 * Provides checkboxes for each map layer (geofences, route types), a badge
	 * showing how many areas are hidden, Show All / Hide All shortcuts, and a
	 * Fit All button. Route layer checkboxes are only shown when the user has
	 * the matching access permission.
	 */
	import { mapState } from '../stores/mapState.svelte';
	import { COLORS } from '../colors';
	import SpawnpointLayerControls from '$lib/features/spawnpoints/components/SpawnpointLayerControls.svelte';
	import type { Area, Permissions } from '$lib/features/area-management/types';

	let {
		permissions,
		areas,
		loggedIn
	}: {
		permissions: Permissions;
		areas: Area[];
		loggedIn: boolean;
	} = $props();
</script>

<div class="layer-controls">
	<span class="controls-label">Layers</span>

	{#if mapState.hiddenAreaIds.size > 0}
		<span class="hidden-badge">{mapState.hiddenAreaIds.size} hidden</span>
		<button class="btn-show-all" onclick={() => mapState.showAll()}>Show All</button>
	{/if}

	<!-- Hide All is available while any polygon is still visible on the map.
	     We compare against polygonCount (a reactive mirror of polygonMap.size)
	     rather than areas.length so that areas without geofences don't keep the
	     button perpetually visible after everything has been hidden. -->
	{#if mapState.hiddenAreaIds.size < mapState.polygonCount}
		<button class="btn-hide-all" onclick={() => mapState.hideAll()}>Hide All</button>
	{/if}

	<button class="btn-fit-all" onclick={() => mapState.fitAll(areas)}>Fit All</button>

	<label class="layer-toggle">
		<input type="checkbox" bind:checked={mapState.showGeofences} />
		<span class="layer-dot" style="background:{COLORS.enabled}"></span>
		Geofences
	</label>

	{#if permissions.canSeePokemonRoutes}
		<label class="layer-toggle">
			<input type="checkbox" bind:checked={mapState.showPokemonRoutes} />
			<span class="layer-dot" style="background:{COLORS.pokemon}"></span>
			Pokemon Routes
		</label>
	{/if}

	{#if permissions.canSeeFortRoutes}
		<label class="layer-toggle">
			<input type="checkbox" bind:checked={mapState.showFortRoutes} />
			<span class="layer-dot" style="background:{COLORS.fort}"></span>
			Fort Routes
		</label>
	{/if}

	{#if permissions.canSeeQuestRoutes}
		<label class="layer-toggle">
			<input type="checkbox" bind:checked={mapState.showQuestRoutes} />
			<span class="layer-dot" style="background:{COLORS.quest}"></span>
			Quest Routes
		</label>
	{/if}

	{#if !permissions.canSeePokemonRoutes && !permissions.canSeeFortRoutes && !permissions.canSeeQuestRoutes}
		<span class="routes-locked">
			{loggedIn ? 'No route access' : 'Login to see routes'}
		</span>
	{/if}

	<SpawnpointLayerControls {permissions} {areas} />
</div>

<style>
	.layer-controls {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid #1a2540;
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.controls-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted);
		margin-right: 0.25rem;
	}

	.hidden-badge {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--token);
		background: rgba(245, 158, 11, 0.12);
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: 5px;
		padding: 0.18rem 0.5rem;
	}

	.btn-show-all {
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.35);
		color: var(--token);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.28rem 0.65rem;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-show-all:hover {
		background: rgba(245, 158, 11, 0.2);
	}

	.btn-hide-all {
		background: rgba(100, 116, 139, 0.08);
		border: 1px solid rgba(100, 116, 139, 0.3);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.28rem 0.65rem;
		border-radius: 6px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.btn-hide-all:hover {
		background: rgba(100, 116, 139, 0.16);
		color: var(--text-secondary);
	}

	.btn-fit-all {
		margin-left: auto;
		background: rgba(56, 189, 248, 0.08);
		border: 1px solid rgba(56, 189, 248, 0.25);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.3rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-fit-all:hover {
		background: rgba(56, 189, 248, 0.16);
	}

	.layer-toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
		transition: color 0.15s;
	}

	.layer-toggle:hover {
		color: var(--text-secondary);
	}

	.layer-toggle input[type='checkbox'] {
		accent-color: #38bdf8;
		width: 13px;
		height: 13px;
		cursor: pointer;
	}

	.layer-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.routes-locked {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		letter-spacing: 0.04em;
		font-style: italic;
	}
</style>
