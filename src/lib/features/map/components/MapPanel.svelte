<script lang="ts">
	/**
	 * Right-hand map panel — initialises Leaflet, mounts layer controls and
	 * the map legend. All reactive rebuilds that depend on map state live here.
	 *
	 * Takes narrow, explicit props (matching AreaList) rather than a whole
	 * page-data blob. Hides on mobile when mapState.mobileView is 'list'.
	 */
	import 'leaflet/dist/leaflet.css';
	import { onMount, untrack } from 'svelte';
	import { mapState } from '../stores/mapState.svelte';
	import { routeState } from '$lib/features/area-management/stores/routeState.svelte';
	import { requestState } from '$lib/features/area-requests/stores/requestState.svelte';
	import { spawnpointState } from '$lib/features/spawnpoints/stores/spawnpointState.svelte';
	import { editState } from '../stores/editState.svelte';
	import { voteState } from '$lib/features/voting/stores/voteState.svelte';
	import { COLORS } from '../colors';
	import LayerControls from './LayerControls.svelte';
	import MapLegend from './MapLegend.svelte';
	import GeofenceEditor from './GeofenceEditor.svelte';
	import RequestButton from '$lib/features/area-requests/components/RequestButton.svelte';
	import type { Area, Permissions } from '$lib/features/area-management/types';
	import type { MapData } from '../types';
	import type { TileSettings } from '../server/tileSettings';
	import type { MapStartView } from '../server/startView';

	let {
		areas,
		permissions,
		loggedIn,
		tileSettings,
		startView
	}: {
		areas: Area[];
		permissions: Permissions;
		loggedIn: boolean;
		tileSettings: TileSettings;
		startView: MapStartView;
	} = $props();

	const mapData = $derived<MapData>({
		areas,
		permissions,
		loggedIn
	});

	let mapEl: HTMLDivElement;

	onMount(() => {
		let disposed = false;
		mapState.initMap(mapEl, mapData, tileSettings, startView).then(() => {
			if (disposed) {
				mapState.map?.remove();
				mapState.map = null;
				mapState.mapReady = false;
			}
		});

		// When the map container transitions from hidden (0×0) to visible, the
		// ResizeObserver fires and corrects Leaflet's internal size without the
		// bad compensating pan that invalidateSize() does by default when it
		// computes the delta from a zero-size origin.
		const ro = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			if (width > 0 && height > 0 && mapState.mapReady) {
				mapState.map?.invalidateSize({ pan: false });
			}
		});
		ro.observe(mapEl);

		return () => {
			disposed = true;
			ro.disconnect();
			mapState.map?.remove();
			// mapState is a singleton that outlives this component: leaving the
			// page and coming back (client-side navigation) must not find a stale
			// mapReady = true pointing at the removed map — anything waiting on
			// mapReady (e.g. AreaList's ?area= deep link) would act on the dead
			// map before initMap builds the new one.
			mapState.map = null;
			mapState.mapReady = false;
		};
	});

	// Rebuild geofence polygons when area data or vote state changes.
	// Clicks are suppressed while drawing a new area's geofence (map clicks
	// there mean "add a vertex", not "select this area").
	$effect(() => {
		void mapData;
		if (mapState.mapReady) {
			const suppressClicks = requestState.requestModeActive && requestState.drawMode === 'draw';
			mapState.rebuildGeofences(mapData, suppressClicks);
		}
	});

	// Update polygon highlight styles when the selected area changes
	$effect(() => {
		void mapState.selectedId;
		if (mapState.mapReady) mapState.updatePolyStyles(areas);
	});

	// Redraw the viewer's "🪙 N" area labels when their allocations, primary
	// area, or hidden areas change (a geofence rebuild redraws them too).
	$effect(() => {
		void voteState.allocations;
		void voteState.primaryAreaId;
		void mapState.hiddenAreaIds;
		if (mapState.mapReady) mapState.renderMyTokenMarkers();
	});

	// Re-render the spawnpoint count line in already-built popups once a
	// background fetch resolves (or the mode changes) — popup content is a
	// static DOM snapshot from when it was built, so nothing else updates it.
	$effect(() => {
		void spawnpointState.counts;
		void spawnpointState.loadingIds;
		void spawnpointState.mode;
		if (mapState.mapReady) mapState.refreshSpawnpointPopups();
	});

	// Toggle the geofence layer group on/off
	$effect(() => {
		if (mapState.mapReady && mapState.geofenceGroup) {
			mapState.showGeofences
				? mapState.map?.addLayer(mapState.geofenceGroup)
				: mapState.map?.removeLayer(mapState.geofenceGroup);
		}
	});

	// Rebuild and toggle Pokemon route layer
	$effect(() => {
		if (mapState.mapReady && mapState.pokemonGroup) {
			if (mapState.showPokemonRoutes) {
				mapState.rebuildRoutes(mapState.pokemonGroup, 'pokemon_mode', COLORS.pokemon, areas);
				mapState.map?.addLayer(mapState.pokemonGroup);
			} else {
				mapState.map?.removeLayer(mapState.pokemonGroup);
			}
		}
	});

	// Rebuild and toggle Fort route layer
	$effect(() => {
		if (mapState.mapReady && mapState.fortGroup) {
			if (mapState.showFortRoutes) {
				mapState.rebuildRoutes(mapState.fortGroup, 'fort_mode', COLORS.fort, areas);
				mapState.map?.addLayer(mapState.fortGroup);
			} else {
				mapState.map?.removeLayer(mapState.fortGroup);
			}
		}
	});

	// Rebuild and toggle Quest route layer
	$effect(() => {
		if (mapState.mapReady && mapState.questGroup) {
			if (mapState.showQuestRoutes) {
				mapState.rebuildRoutes(mapState.questGroup, 'quest_mode', COLORS.quest, areas);
				mapState.map?.addLayer(mapState.questGroup);
			} else {
				mapState.map?.removeLayer(mapState.questGroup);
			}
		}
	});

	// When hidden areas change, rebuild any currently-visible route layers so
	// that newly-hidden areas are excluded from the route polylines
	$effect(() => {
		void mapState.hiddenAreaIds;
		if (mapState.mapReady) {
			if (mapState.showPokemonRoutes && mapState.pokemonGroup)
				mapState.rebuildRoutes(mapState.pokemonGroup, 'pokemon_mode', COLORS.pokemon, areas);
			if (mapState.showFortRoutes && mapState.fortGroup)
				mapState.rebuildRoutes(mapState.fortGroup, 'fort_mode', COLORS.fort, areas);
			if (mapState.showQuestRoutes && mapState.questGroup)
				mapState.rebuildRoutes(mapState.questGroup, 'quest_mode', COLORS.quest, areas);
		}
	});

	// Draw or clear the Kōji route preview polyline
	$effect(() => {
		if (mapState.mapReady && mapState.previewRouteGroup && mapState.L) {
			if (routeState.previewRoute) {
				routeState.drawPreviewRoute(
					routeState.previewRoute.coords,
					mapState.L,
					mapState.previewRouteGroup
				);
			} else {
				mapState.previewRouteGroup.clearLayers();
			}
		}
	});

	// Enter/exit editState's draw-new-area bootstrap as request mode's draw
	// sub-mode activates/deactivates
	$effect(() => {
		if (!mapState.mapReady || !mapState.map || !mapState.L || !mapState.geofenceGroup) return;
		const drawing = requestState.requestModeActive && requestState.drawMode === 'draw';
		if (drawing && !editState.drawingNew) {
			editState.enterDrawMode(
				areas,
				mapState.L,
				mapState.map,
				mapState.polygonMap,
				mapState.geofenceGroup,
				(a, sel) => mapState.getPolyStyle(a, sel),
				mapState.selectedId
			);
		} else if (!drawing && editState.drawingNew) {
			editState.exitDrawMode(
				mapState.L,
				mapState.map,
				mapState.polygonMap,
				areas,
				(a, sel) => mapState.getPolyStyle(a, sel),
				mapState.selectedId
			);
		}
	});

	// Forward map clicks to the draw-mode bootstrap vertex placement
	$effect(() => {
		if (!mapState.mapReady || !mapState.map || !mapState.L) return;
		if (!(requestState.requestModeActive && requestState.drawMode === 'draw')) return;

		const handler = (e: { latlng: { lat: number; lng: number } }) => {
			editState.addDrawVertex(e.latlng.lat, e.latlng.lng, mapState.L!, mapState.map!);
		};
		mapState.map.on('click', handler);
		return () => {
			mapState.map?.off('click', handler);
		};
	});

	// While selecting an existing area for a removal request, rewire polygon
	// clicks to capture its geofence instead of the normal select-and-scroll
	// behavior, and highlight the captured area distinctly so the user gets
	// feedback that their click registered. Leaving select mode restores
	// normal click handlers/styles via a full rebuild (matching the first
	// effect's own suppress-aware rebuild).
	$effect(() => {
		if (!mapState.mapReady) return;
		if (requestState.requestModeActive && requestState.drawMode === 'select') {
			const capturedId = requestState.selectedAreaId;
			for (const area of areas) {
				const poly = mapState.polygonMap.get(area.id);
				if (!poly) continue;
				poly.off('click');
				poly.on('click', () => requestState.captureArea(area));
				poly.setStyle(mapState.getPolyStyle(area, false, area.id === capturedId));
			}
		} else {
			const suppressClicks = requestState.requestModeActive && requestState.drawMode === 'draw';
			mapState.rebuildGeofences(mapData, suppressClicks);
		}
	});

	// When the user switches to map view on mobile, invalidate Leaflet's size
	// then zoom to the selected area (or fit all areas if none is selected)
	$effect(() => {
		if (mapState.mobileView === 'map' && mapState.mapReady) {
			mapState.onMobileMapActivated(untrack(() => areas));
		}
	});
</script>

<div class="map-panel" class:mobile-hidden={mapState.mobileView === 'list'}>
	<LayerControls {permissions} {areas} {loggedIn} />

	<div class="map-wrap">
		<div class="map-el" bind:this={mapEl}></div>
		<GeofenceEditor {mapData} />
		<RequestButton {loggedIn} />
	</div>

	<MapLegend {permissions} />
</div>

<style>
	.map-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: 0;
		min-width: 0;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 12px;
		overflow: hidden;
	}

	.map-wrap {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.map-el {
		/* Explicit relative anchor for Leaflet's absolutely-positioned panes */
		position: relative;
		width: 100%;
		height: 100%;
	}

	/* Dark Leaflet popup theme */
	:global(.leaflet-popup-content-wrapper) {
		background: #0d1425;
		border: 1px solid #1a2540;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
		color: var(--text);
		border-radius: 10px;
	}

	:global(.leaflet-popup-tip) {
		background: #0d1425;
	}

	:global(.leaflet-popup-content) {
		margin: 10px 14px;
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	:global(.leaflet-popup-close-button) {
		color: var(--text-muted) !important;
		font-size: 18px !important;
		top: 6px !important;
		right: 8px !important;
	}

	:global(.leaflet-popup-close-button:hover) {
		color: var(--text-secondary) !important;
	}

	/* "🪙 N" label on areas the viewer has tokens on. Leaflet positions the
	   marker element with its own transform, so the centring translate goes on
	   the inner span; the element itself drops divIcon's default white box. */
	:global(.my-token-marker) {
		background: none;
		border: none;
		width: 0 !important;
		height: 0 !important;
	}

	:global(.my-token-marker span) {
		display: inline-block;
		transform: translate(-50%, -50%);
		white-space: nowrap;
		background: rgba(245, 158, 11, 0.9);
		color: #04111f;
		font-size: var(--text-xs);
		font-weight: 700;
		line-height: 1;
		padding: 0.25rem 0.45rem;
		border-radius: 999px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}

	/* Mobile: give the map panel an explicit height (flex:1 collapses in an
	   height:auto column container) and hide whichever panel is not active */
	@media (max-width: 768px) {
		.map-panel {
			flex: none;
			height: 75vh;
		}

		.map-panel.mobile-hidden {
			display: none;
		}
	}
</style>
