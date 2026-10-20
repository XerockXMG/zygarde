/**
 * Geofence visual editing state.
 *
 * Manages the full lifecycle of editing a geofence on the map: entering edit
 * mode (detaching the static polygon, building the snap cache, and handing
 * the polygon to a `VertexEditor` for the drag/insert/delete/snap handles),
 * mirroring its vertices into `editingVertices`, and exiting edit mode by
 * either saving or discarding. This is the app's second and last
 * client store (after mapState) — it never imports mapState; Leaflet
 * internals are passed in as parameters by whichever component drives it.
 */
import { invalidateAll } from '$app/navigation';
import { deserialize } from '$app/forms';
import { kojiSyncNotice } from '$lib/features/area-management/kojiSyncNotice';
import {
	appendDrawVertex,
	canVisuallyEditPolygon,
	findSnap,
	geoJsonToLatLngs,
	latLngsToGeoJson
} from '../geometry';
import { SNAP_THRESHOLD_PX, VertexEditor } from '../vertexEditor';
import type * as Leaflet from 'leaflet';
import type { Area, GeoJsonPolygon } from '$lib/features/area-management/types';
import type { LatLngTuple } from '../types';

/** Pixel distance within which a draw-mode click on the first vertex closes the shape. */
const CLOSE_VERTEX_THRESHOLD_PX = 16;

class EditStateClass {
	/** ID of the area currently being edited, or null when not editing. */
	editingAreaId = $state<number | null>(null);

	/** Working copy of the geofence vertices (no duplicate closing point). */
	editingVertices = $state<LatLngTuple[]>([]);

	/** True while a geofence save request is in flight. */
	editSaving = $state(false);

	/**
	 * "Also update in Kōji" for the current edit. Reset to off every time an
	 * edit starts, so each save opts in explicitly.
	 */
	syncKoji = $state(false);

	/** True while drawing a brand-new area's geofence from scratch (no existing Area). */
	drawingNew = $state(false);

	// Leaflet objects (not reactive — Leaflet owns the DOM)
	/**
	 * The polygon + vertex/midpoint handles for the current edit, or for a
	 * draw-mode shape once it has been closed. Null otherwise.
	 */
	vertexEditor: VertexEditor | null = null;
	/** Placeholder vertex markers shown while freehand-drawing, before the shape is closed. */
	editingMarkerGroup: Leaflet.LayerGroup | null = null;
	/** Dashed outline shown while freehand-drawing a new geofence, before it's closed. */
	drawPreviewLine: Leaflet.Polyline | null = null;

	/** Pre-parsed coordinate rings of all other areas for snap checks. */
	snapCache: LatLngTuple[][] = [];

	// ── Edit mode lifecycle ─────────────────────────────────────────────────

	/**
	 * Enter edit mode for the given area. Only Polygon-shaped geofences can be
	 * visually edited (MultiPolygon/missing geofences are a no-op here — the
	 * caller gates the "Edit Geofence" button on this same condition).
	 *
	 * Also a no-op while a brand-new area is being drawn: the two modes share
	 * the same Leaflet layers, so entering one over the other would orphan the
	 * other's layers on the map. (The reverse direction is guarded by
	 * `RequestButton.svelte`.)
	 */
	enterEditMode(
		area: Area,
		areas: Area[],
		L: typeof Leaflet,
		map: Leaflet.Map,
		polygonMap: Map<number, Leaflet.Polygon>,
		geofenceGroup: Leaflet.LayerGroup,
		getPolyStyle: (area: Area, selected: boolean) => Leaflet.PathOptions,
		selectedId: number | null
	): void {
		if (this.drawingNew) return;
		if (!canVisuallyEditPolygon(area.geofence)) return;
		if (this.editingAreaId !== null) {
			this.exitEditMode(false, L, map, polygonMap, geofenceGroup, getPolyStyle, selectedId, areas);
		}

		this.editingAreaId = area.id;
		this.syncKoji = false;

		const rings = geoJsonToLatLngs(area.geofence);
		const initial = rings[0] ?? [];
		this.editingVertices = initial;

		this.snapCache = areas
			.filter((a) => a.id !== area.id)
			.flatMap((a) => geoJsonToLatLngs(a.geofence))
			.filter((ring) => ring.length >= 3);

		const existing = polygonMap.get(area.id);
		if (existing) {
			geofenceGroup.removeLayer(existing);
			polygonMap.delete(area.id);
		}

		this.vertexEditor = new VertexEditor(L, map, {
			vertices: initial,
			snapRings: this.snapCache,
			onChange: (v) => (this.editingVertices = v)
		});

		for (const [id, poly] of polygonMap) {
			if (id !== area.id) poly.setStyle({ opacity: 0.2, fillOpacity: 0.02 });
		}

		map.fitBounds(this.vertexEditor.bounds, { padding: [60, 60] });
	}

	/**
	 * Enter draw mode for a brand-new area — no existing `Area` required.
	 * Starts with zero vertices; `addDrawVertex` appends a vertex per click,
	 * showing a growing dashed outline, until a click lands near the first
	 * vertex — closing the shape and handing off to a `VertexEditor` (the
	 * same vertex/midpoint marker system `enterEditMode` uses).
	 */
	enterDrawMode(
		areas: Area[],
		L: typeof Leaflet,
		map: Leaflet.Map,
		polygonMap: Map<number, Leaflet.Polygon>,
		geofenceGroup: Leaflet.LayerGroup,
		getPolyStyle: (area: Area, selected: boolean) => Leaflet.PathOptions,
		selectedId: number | null
	): void {
		if (this.editingAreaId !== null) {
			this.exitEditMode(false, L, map, polygonMap, geofenceGroup, getPolyStyle, selectedId, areas);
		}

		this.drawingNew = true;
		this.editingVertices = [];
		this.drawPreviewLine = null;
		this.snapCache = areas
			.flatMap((a) => geoJsonToLatLngs(a.geofence))
			.filter((ring) => ring.length >= 3);
		this.editingMarkerGroup = L.layerGroup().addTo(map);

		for (const [, poly] of polygonMap) poly.setStyle({ opacity: 0.2, fillOpacity: 0.02 });
	}

	/**
	 * Append a vertex while freehand-drawing a new geofence. Each click adds
	 * a placeholder marker and redraws a dashed preview outline through all
	 * placed vertices. Once at least 3 vertices exist, a click within
	 * `CLOSE_VERTEX_THRESHOLD_PX` pixels of the first vertex closes the
	 * shape instead of adding another point — handing the vertices to a
	 * `VertexEditor` (drag/delete/insert/snap). A no-op once `drawingNew` is
	 * false or the shape is already closed (`vertexEditor` set).
	 *
	 * The click point itself is snapped to a nearby existing area's
	 * vertex/edge (via `snapCache`, same as the post-close drag handlers)
	 * before being placed, so a new geofence can be lined up exactly against
	 * existing coverage as it's drawn rather than only after the fact.
	 */
	addDrawVertex(lat: number, lng: number, L: typeof Leaflet, map: Leaflet.Map): void {
		if (!this.drawingNew || this.vertexEditor) return;

		if (this.editingVertices.length >= 3) {
			const clickPt = map.latLngToContainerPoint([lat, lng]);
			const startPt = map.latLngToContainerPoint(this.editingVertices[0]);
			if (clickPt.distanceTo(startPt) <= CLOSE_VERTEX_THRESHOLD_PX) {
				this._closeDrawnPolygon(L, map);
				return;
			}
		}

		const snapped = findSnap(L.latLng(lat, lng), this.snapCache, map, L, SNAP_THRESHOLD_PX);
		const placed: LatLngTuple = snapped ? [snapped.lat, snapped.lng] : [lat, lng];

		this.editingVertices = appendDrawVertex(this.editingVertices, placed[0], placed[1]);

		if (this.drawPreviewLine) map.removeLayer(this.drawPreviewLine);
		if (this.editingVertices.length >= 2) {
			this.drawPreviewLine = L.polyline(this.editingVertices, {
				color: '#f59e0b',
				weight: 2,
				dashArray: '7 4'
			}).addTo(map);
		}

		L.marker(placed, {
			icon: L.divIcon({
				className: 'vertex-handle',
				html: '',
				iconSize: [14, 14],
				iconAnchor: [7, 7]
			})
		}).addTo(this.editingMarkerGroup!);
	}

	/**
	 * Close the in-progress draw-mode shape: replace the preview outline and
	 * placeholder markers with a `VertexEditor` (real editable polygon, in the
	 * draw-mode orange style).
	 */
	private _closeDrawnPolygon(L: typeof Leaflet, map: Leaflet.Map): void {
		if (this.drawPreviewLine) {
			map.removeLayer(this.drawPreviewLine);
			this.drawPreviewLine = null;
		}
		if (this.editingMarkerGroup) {
			map.removeLayer(this.editingMarkerGroup);
			this.editingMarkerGroup = null;
		}
		this.vertexEditor = new VertexEditor(L, map, {
			vertices: this.editingVertices,
			snapRings: this.snapCache,
			onChange: (v) => (this.editingVertices = v),
			polygonStyle: {
				color: '#f59e0b',
				fillColor: '#f59e0b',
				fillOpacity: 0.15,
				weight: 2,
				dashArray: '7 4'
			}
		});
	}

	/**
	 * Exit draw mode, tearing down its Leaflet layers and restoring normal
	 * polygon styles. Returns the final GeoJSON Polygon if at least 3
	 * vertices were placed, else null. Callers that need the drawn shape
	 * (e.g. to submit a request) should read it before this runs if they
	 * rely on `editingVertices` directly — this clears that array.
	 */
	exitDrawMode(
		L: typeof Leaflet,
		map: Leaflet.Map,
		polygonMap: Map<number, Leaflet.Polygon>,
		areas: Area[],
		getPolyStyle: (area: Area, selected: boolean) => Leaflet.PathOptions,
		selectedId: number | null
	): GeoJsonPolygon | null {
		if (!this.drawingNew) return null;
		const vertices = [...this.editingVertices];

		this.drawingNew = false;
		this.editingVertices = [];
		this.snapCache = [];

		if (this.drawPreviewLine) {
			map.removeLayer(this.drawPreviewLine);
			this.drawPreviewLine = null;
		}
		if (this.vertexEditor) {
			this.vertexEditor.destroy();
			this.vertexEditor = null;
		}
		if (this.editingMarkerGroup) {
			map.removeLayer(this.editingMarkerGroup);
			this.editingMarkerGroup = null;
		}

		for (const [id, poly] of polygonMap) {
			const a = areas.find((x) => x.id === id);
			if (a) poly.setStyle(getPolyStyle(a, id === selectedId));
		}

		return vertices.length >= 3 ? latLngsToGeoJson(vertices) : null;
	}

	/**
	 * Exit edit mode, optionally saving the current vertices.
	 *
	 * @param onPolygonClick - Called when the user clicks the restored
	 *   (discarded) polygon. Callers use this to update selectedId — keeping
	 *   editState free of mapState imports.
	 */
	exitEditMode(
		save: boolean,
		L: typeof Leaflet,
		map: Leaflet.Map,
		polygonMap: Map<number, Leaflet.Polygon>,
		geofenceGroup: Leaflet.LayerGroup,
		getPolyStyle: (area: Area, selected: boolean) => Leaflet.PathOptions,
		selectedId: number | null,
		areas: Area[],
		onPolygonClick?: (areaId: number) => void
	): void {
		if (this.editingAreaId === null) return;
		const areaId = this.editingAreaId;
		const vertices = [...this.editingVertices];

		this.editingAreaId = null;
		this.editingVertices = [];
		this.snapCache = [];

		if (this.vertexEditor) {
			this.vertexEditor.destroy();
			this.vertexEditor = null;
		}

		for (const [id, poly] of polygonMap) {
			const a = areas.find((x) => x.id === id);
			if (a) poly.setStyle(getPolyStyle(a, id === selectedId));
		}

		if (save) {
			this._saveGeofence(areaId, vertices);
		} else {
			const area = areas.find((a) => a.id === areaId);
			if (area) {
				const rings = geoJsonToLatLngs(area.geofence).filter((r) => r.length >= 3);
				if (rings.length > 0) {
					const poly = L.polygon(
						rings.map((ring) => [ring]),
						getPolyStyle(area, areaId === selectedId)
					)
						.bindPopup(document.createElement('div'))
						.addTo(geofenceGroup);
					poly.on('click', () => {
						onPolygonClick?.(areaId);
					});
					polygonMap.set(areaId, poly);
				}
			}
		}
	}

	// ── Persistence ─────────────────────────────────────────────────────────

	/** Serialize and POST the edited vertices to the saveGeofence action. */
	private async _saveGeofence(areaId: number, vertices: LatLngTuple[]): Promise<void> {
		this.editSaving = true;
		try {
			const geofence = latLngsToGeoJson(vertices);
			const fd = new FormData();
			fd.append('areaId', String(areaId));
			fd.append('geofence', JSON.stringify(geofence));
			if (this.syncKoji) fd.append('syncKoji', '1');

			let res: Response;
			try {
				res = await fetch('?/saveGeofence', {
					method: 'POST',
					headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
					body: fd
				});
			} catch {
				alert('Network error — failed to save geofence. Please try again.');
				return;
			}

			let result: ReturnType<typeof deserialize>;
			try {
				result = deserialize(await res.text());
			} catch {
				alert('Failed to save geofence — unexpected response from the server.');
				return;
			}

			if (result.type === 'success') {
				await invalidateAll();
				const notice = kojiSyncNotice(result.data);
				if (notice) alert(notice);
				return;
			}

			const data =
				result.type === 'failure'
					? (result.data as Record<string, unknown> | undefined)
					: undefined;
			const message = typeof data?.message === 'string' ? data.message : 'Failed to save geofence.';
			alert(message);
		} finally {
			this.editSaving = false;
		}
	}
}

/** Singleton edit state — import in components that manage geofence editing. */
export const editState = new EditStateClass();
