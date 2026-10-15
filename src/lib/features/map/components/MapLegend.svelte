<script lang="ts">
	/**
	 * Map legend strip — shown at the bottom of the map panel. Displays colour
	 * swatches and line samples for each layer. Route layer entries are shown
	 * regardless of access flags — the controls bar already gates visibility
	 * of those layers.
	 */
	import { COLORS } from '../colors';
	import type { Permissions } from '$lib/features/area-management/types';

	let { permissions }: { permissions: Permissions } = $props();
</script>

<div class="map-legend">
	<span class="legend-item">
		<span class="legend-swatch" style="background:{COLORS.enabled}"></span> Enabled
	</span>
	{#if permissions.canSeeOfflineAreas}
		<span class="legend-item">
			<span class="legend-swatch" style="background:{COLORS.disabled}"></span> Disabled
		</span>
	{/if}
	<span class="legend-item">
		<span class="legend-line" style="background:{COLORS.pokemon}"></span> Pkmn route
	</span>
	<span class="legend-item">
		<span class="legend-line" style="background:{COLORS.fort}"></span> Fort route
	</span>
	<span class="legend-item">
		<span class="legend-line" style="background:{COLORS.quest}"></span> Quest route
	</span>
</div>

<style>
	.map-legend {
		display: flex;
		gap: 1.25rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid #1a2540;
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.legend-swatch {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
		opacity: 0.85;
	}

	.legend-line {
		width: 16px;
		height: 3px;
		border-radius: 2px;
		flex-shrink: 0;
		opacity: 0.85;
	}
</style>
