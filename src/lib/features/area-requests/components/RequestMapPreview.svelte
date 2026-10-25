<!-- src/lib/features/area-requests/components/RequestMapPreview.svelte -->
<script lang="ts">
	/**
	 * Self-contained Leaflet preview for the admin request-review page: draws
	 * all current areas as a static background so an admin can spot overlap
	 * before approving, then highlights whichever request is selected (plus
	 * the target area, for a removal request).
	 *
	 * Deliberately its own Leaflet instance rather than the shared `mapState`
	 * singleton — that store carries the home page's selection/editing/
	 * permission logic, none of which applies here.
	 */
	import 'leaflet/dist/leaflet.css';
	import '$lib/features/map/editHandles.css';
	import { invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import type * as Leaflet from 'leaflet';
	import {
		geoJsonToLatLngs,
		latLngsToGeoJson,
		canVisuallyEditPolygon
	} from '$lib/features/map/geometry';
	import { VertexEditor } from '$lib/features/map/vertexEditor';
	import { postForm } from '$lib/utils/postForm';
	import type { LatLngTuple } from '$lib/features/map/types';
	import { COLORS } from '$lib/features/map/colors';
	import type { AdminAreaRequest } from '$lib/features/area-requests/server/requests';
	import type { AreaMapSummary } from '$lib/features/area-requests/types';
	import type { TileSettings } from '$lib/features/map/server/tileSettings';
	import type { MapStartView } from '$lib/features/map/server/startView';
	import { escapeHtml } from '$lib/utils/html';

	let {
		areas,
		tileSettings,
		startView,
		selected
	}: {
		areas: AreaMapSummary[];
		tileSettings: TileSettings;
		startView: MapStartView;
		selected: AdminAreaRequest | null;
	} = $props();

	let mapEl: HTMLDivElement;
	let L: typeof Leaflet | null = null;
	let map: Leaflet.Map | null = null;
	let bgGroup: Leaflet.LayerGroup | null = null;
	let highlightGroup: Leaflet.LayerGroup | null = null;
	let mapReady = $state(false);

	let editor: VertexEditor | null = null;
	// Plain (non-reactive) id of the request being edited.
	let editingId: number | null = null;
	let editing = $state(false);
	let saving = $state(false);
	let vertexCount = $state(0);

	const canEditRequest = $derived(selected?.status === 'pending' && selected.type === 'addition');
	const polygonEditable = $derived.by(() => {
		if (!selected) return false;
		try {
			return canVisuallyEditPolygon(JSON.parse(selected.geofence));
		} catch {
			return false;
		}
	});

	function stopEditing(): void {
		editor?.destroy();
		editor = null;
		editing = false;
		editingId = null;
		saving = false;
		drawHighlight();
	}

	function startEditing(): void {
		if (!L || !map || !selected || !polygonEditable) return;
		const ring = geoJsonToLatLngs(JSON.parse(selected.geofence))[0];
		highlightGroup?.clearLayers();
		const snapRings: LatLngTuple[][] = areas.flatMap((a) => geoJsonToLatLngs(a.geofence));
		vertexCount = ring.length;
		editor = new VertexEditor(L, map, {
			vertices: ring,
			snapRings,
			onChange: (v) => (vertexCount = v.length)
		});
		editingId = selected.id;
		editing = true;
	}

	async function saveEdit(): Promise<void> {
		if (!editor || !selected || saving) return;
		saving = true;
		try {
			const result = await postForm('?/updateRequestGeofence', {
				id: String(selected.id),
				geofence: JSON.stringify(latLngsToGeoJson(editor.vertices))
			});
			if (!result.ok) {
				alert(result.message ?? 'Failed to save the geofence.');
				return;
			}
			await invalidateAll();
			stopEditing();
		} catch {
			alert('Failed to save the geofence.');
		} finally {
			saving = false;
		}
	}

	function drawBackground(): void {
		if (!L || !bgGroup) return;
		bgGroup.clearLayers();
		for (const area of areas) {
			for (const ring of geoJsonToLatLngs(area.geofence)) {
				if (ring.length < 3) continue;
				const color = area.enabled ? COLORS.enabled : COLORS.disabled;
				L.polygon(ring, {
					color,
					fillColor: color,
					fillOpacity: area.enabled ? 0.1 : 0.04,
					weight: area.enabled ? 2 : 1,
					interactive: false
				})
					.bindTooltip(escapeHtml(area.name), { sticky: true })
					.addTo(bgGroup);
			}
		}
	}

	function drawHighlight(): void {
		if (!L || !map || !highlightGroup) return;
		highlightGroup.clearLayers();
		if (!selected) return;

		let requestedGeometry;
		try {
			requestedGeometry = JSON.parse(selected.geofence);
		} catch {
			return;
		}

		const bounds: Leaflet.LatLngBounds[] = [];

		for (const ring of geoJsonToLatLngs(requestedGeometry)) {
			if (ring.length < 3) continue;
			const poly = L.polygon(ring, {
				color: COLORS.requestHighlight,
				fillColor: COLORS.requestHighlight,
				fillOpacity: 0.2,
				weight: 2.5,
				interactive: false
			}).addTo(highlightGroup);
			bounds.push(poly.getBounds());
		}

		if (selected.type === 'removal' && selected.existingAreaId != null) {
			const targetArea = areas.find((a) => a.id === selected.existingAreaId);
			if (targetArea) {
				for (const ring of geoJsonToLatLngs(targetArea.geofence)) {
					if (ring.length < 3) continue;
					const poly = L.polygon(ring, {
						color: COLORS.removalTarget,
						fillColor: COLORS.removalTarget,
						fillOpacity: 0.15,
						weight: 2,
						interactive: false
					}).addTo(highlightGroup);
					bounds.push(poly.getBounds());
				}
			}
		}

		if (bounds.length > 0) {
			let combined = bounds[0];
			for (const b of bounds.slice(1)) combined = combined.extend(b);
			map.fitBounds(combined, { padding: [40, 40] });
		}
	}

	onMount(() => {
		let disposed = false;
		let ro: ResizeObserver;

		(async () => {
			L = (await import('leaflet')).default as unknown as typeof Leaflet;
			if (disposed) return;

			map = L.map(mapEl, {
				zoomControl: true,
				scrollWheelZoom: true,
				doubleClickZoom: false
			}).setView([startView.lat, startView.lon], startView.zoom);

			L.tileLayer(tileSettings.urlTemplate, {
				attribution: tileSettings.attribution,
				maxZoom: tileSettings.maxZoom,
				tileSize: tileSettings.tileSize,
				zoomOffset: tileSettings.zoomOffset
			}).addTo(map);

			bgGroup = L.layerGroup().addTo(map);
			highlightGroup = L.layerGroup().addTo(map);
			mapReady = true;

			drawBackground();
			drawHighlight();

			const allPoints = areas.flatMap((a) => geoJsonToLatLngs(a.geofence).flat());
			if (!selected && allPoints.length > 0) {
				map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30] });
			}

			ro = new ResizeObserver((entries) => {
				const { width, height } = entries[0].contentRect;
				if (width > 0 && height > 0) map?.invalidateSize({ pan: false });
			});
			ro.observe(mapEl);
		})();

		return () => {
			disposed = true;
			editor?.destroy();
			editor = null;
			ro?.disconnect();
			map?.remove();
		};
	});

	$effect(() => {
		void areas;
		if (mapReady) drawBackground();
	});

	// Reactive reads: selected (via selected?.id / selected?.geofence) and mapReady.
	// Everything else runs untracked, so toggling `editing` or whatever
	// drawHighlight reads never re-triggers this. A re-created `selected` object
	// with the same id and geofence (unrelated invalidation) does re-run it, which
	// is harmless: mid-edit the same-id guard leaves the editor alone, otherwise
	// it just redraws the same highlight.
	$effect(() => {
		const id = selected?.id ?? null;
		void selected?.geofence;
		if (!mapReady) return;
		untrack(() => {
			// Same request still being edited (e.g. our own save refreshing its
			// geofence): leave the editor alone; stopEditing() redraws afterwards.
			if (editing && id === editingId) return;
			if (editing)
				stopEditing(); // different request selected: cancel (also redraws)
			else drawHighlight();
		});
	});
</script>

<div class="map-wrap">
	<div class="map-el" bind:this={mapEl}></div>
	{#if canEditRequest}
		<div class="edit-bar">
			{#if editing}
				<span class="edit-count">{vertexCount} points</span>
				<span class="edit-hint">
					drag to move · right-click to delete · click/drag midpoints to add
				</span>
				<button type="button" class="btn btn-success btn-sm" disabled={saving} onclick={saveEdit}>
					{saving ? 'Saving…' : 'Save'}
				</button>
				<button type="button" class="btn btn-sm" disabled={saving} onclick={stopEditing}>
					Cancel
				</button>
			{:else}
				<button
					type="button"
					class="btn btn-sm"
					disabled={!polygonEditable}
					title={polygonEditable ? undefined : 'Only single polygons can be edited on the map'}
					onclick={startEditing}
				>
					Edit geofence
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.map-wrap {
		flex: 1;
		min-height: 0;
		position: relative;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 12px;
		overflow: hidden;
	}

	.edit-bar {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 1000;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		max-width: calc(100% - 20px);
		gap: 8px;
		padding: 6px 10px;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 8px;
		color: var(--text);
		font-size: 0.8rem;
	}

	.edit-hint {
		opacity: 0.7;
	}

	.map-el {
		position: relative;
		width: 100%;
		height: 100%;
	}

	:global(.leaflet-popup-content-wrapper),
	:global(.leaflet-tooltip) {
		background: #0d1425;
		border: 1px solid #1a2540;
		color: var(--text);
	}
</style>
