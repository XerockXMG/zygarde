/**
 * Reusable Leaflet geofence point editor.
 *
 * Owns, for one polygon on one map: the dashed editable polygon, a draggable
 * vertex marker per point (snaps to `snapRings` while dragging, right-click
 * deletes down to a minimum of 3), a midpoint marker per edge (click or drag
 * to insert a vertex there), and the snap indicator ring. Knows nothing about
 * areas, saving, or Svelte state — the owner passes the Leaflet runtime in,
 * reads `vertices`, and listens via `onChange`. Leaflet objects stay
 * non-reactive (see CLAUDE.md "Map/Leaflet state").
 *
 * The handle styles (`.vertex-handle`, `.midpoint-handle`) live in
 * `editHandles.css`; whichever component hosts the map must import it.
 */
import { findSnap, removeVertex } from './geometry';
import type * as Leaflet from 'leaflet';
import type { LatLngTuple } from './types';

/** Pixel distance within which a dragged vertex snaps to another area's geofence. */
export const SNAP_THRESHOLD_PX = 16;

/** Default polygon style: the amber dashed outline used when editing an existing area. */
const DEFAULT_POLYGON_STYLE: Leaflet.PathOptions = {
	color: '#fbbf24',
	fillColor: '#fbbf24',
	fillOpacity: 0.12,
	weight: 2.5,
	dashArray: '7 4'
};

export interface VertexEditorOptions {
	/** Initial ring (no duplicate closing point). Copied — the caller's array is never mutated. */
	vertices: LatLngTuple[];
	/** Coordinate rings to snap dragged vertices to. */
	snapRings: LatLngTuple[][];
	/** Called with a copy of the vertices after every drag move, insert, and delete. */
	onChange?: (vertices: LatLngTuple[]) => void;
	/** Polygon path style; defaults to the amber dashed edit style. */
	polygonStyle?: Leaflet.PathOptions;
}

function copyVertices(vertices: LatLngTuple[]): LatLngTuple[] {
	return vertices.map(([lat, lng]) => [lat, lng]);
}

export class VertexEditor {
	private readonly L: typeof Leaflet;
	private readonly map: Leaflet.Map;
	private readonly snapRings: LatLngTuple[][];
	private readonly onChange?: (vertices: LatLngTuple[]) => void;

	private verts: LatLngTuple[];
	private polygon: Leaflet.Polygon;
	private markerGroup: Leaflet.LayerGroup | null = null;
	private snapIndicator: Leaflet.CircleMarker | null = null;
	private destroyed = false;

	constructor(L: typeof Leaflet, map: Leaflet.Map, opts: VertexEditorOptions) {
		this.L = L;
		this.map = map;
		this.snapRings = opts.snapRings;
		this.onChange = opts.onChange;
		this.verts = copyVertices(opts.vertices);

		this.polygon = L.polygon(this.verts, opts.polygonStyle ?? DEFAULT_POLYGON_STYLE).addTo(map);
		this.rebuild();
	}

	/** A copy of the current vertices. */
	get vertices(): LatLngTuple[] {
		return copyVertices(this.verts);
	}

	/** Bounds of the edited polygon. */
	get bounds(): Leaflet.LatLngBounds {
		return this.polygon.getBounds();
	}

	/** Remove the polygon, all markers, and the snap indicator from the map. */
	destroy(): void {
		this.destroyed = true;
		this.map.removeLayer(this.polygon);
		if (this.markerGroup) {
			this.map.removeLayer(this.markerGroup);
			this.markerGroup = null;
		}
		this.clearSnapIndicator();
	}

	// ── Internals ──────────────────────────────────────────────────────────

	/** Push the working vertices to the polygon and notify the owner. */
	private changed(): void {
		this.polygon.setLatLngs(this.verts);
		this.onChange?.(this.vertices);
	}

	/** Recreate all vertex and midpoint drag markers. */
	private rebuild(): void {
		if (this.markerGroup) this.map.removeLayer(this.markerGroup);
		this.markerGroup = this.L.layerGroup().addTo(this.map);
		for (let i = 0; i < this.verts.length; i++) this.createVertexMarker(i);
		for (let i = 0; i < this.verts.length; i++) this.createMidpointMarker(i);
	}

	private clearSnapIndicator(): void {
		if (this.snapIndicator) {
			this.map.removeLayer(this.snapIndicator);
			this.snapIndicator = null;
		}
	}

	/**
	 * Snap `marker`'s dragged position to a nearby ring vertex/edge if one is
	 * within `SNAP_THRESHOLD_PX`, showing/moving the snap ring; clears the ring
	 * otherwise. Returns the (possibly snapped) position.
	 */
	private snapDrag(marker: Leaflet.Marker): Leaflet.LatLng {
		const { L, map } = this;
		let pos = marker.getLatLng();
		const snapped = findSnap(pos, this.snapRings, map, L, SNAP_THRESHOLD_PX);
		if (snapped) {
			pos = snapped;
			if (!this.snapIndicator) {
				this.snapIndicator = L.circleMarker(pos, {
					radius: 9,
					color: '#fbbf24',
					weight: 2.5,
					fill: false,
					className: 'snap-ring',
					interactive: false
				}).addTo(map);
			} else {
				this.snapIndicator.setLatLng(pos);
			}
			marker.setLatLng(pos);
		} else {
			this.clearSnapIndicator();
		}
		return pos;
	}

	/**
	 * Create a draggable vertex marker at the given index. Snaps to nearby
	 * geofence vertices/edges during drag; right-click deletes (min 3 kept).
	 */
	private createVertexMarker(index: number): void {
		const { L } = this;
		const [lat, lng] = this.verts[index];
		const marker = L.marker([lat, lng], {
			draggable: true,
			zIndexOffset: 500,
			icon: L.divIcon({
				className: 'vertex-handle',
				html: '',
				iconSize: [14, 14],
				iconAnchor: [7, 7]
			})
		});

		marker.on('drag', (e) => {
			const pos = this.snapDrag(e.target as Leaflet.Marker);
			this.verts[index] = [pos.lat, pos.lng];
			this.changed();
		});

		marker.on('dragend', () => {
			this.clearSnapIndicator();
			this.rebuild();
		});

		marker.on('contextmenu', (e) => {
			L.DomEvent.stopPropagation(e);
			const next = removeVertex(this.verts, index);
			if (!next) return;
			this.verts = next;
			this.changed();
			this.rebuild();
		});

		marker.addTo(this.markerGroup!);
	}

	/**
	 * Create a midpoint marker between vertex `indexA` and the next vertex.
	 * Clicking or drag-starting it inserts a new vertex there. A
	 * `setTimeout(...,0)` after click defers the marker-group rebuild so
	 * Leaflet finishes processing the click event first — otherwise the
	 * newly created vertex marker can't be dragged immediately.
	 */
	private createMidpointMarker(indexA: number): void {
		const { L } = this;
		const indexB = (indexA + 1) % this.verts.length;
		const [lat1, lng1] = this.verts[indexA];
		const [lat2, lng2] = this.verts[indexB];
		const midLat = (lat1 + lat2) / 2;
		const midLng = (lng1 + lng2) / 2;

		const marker = L.marker([midLat, midLng], {
			draggable: true,
			zIndexOffset: 400,
			icon: L.divIcon({
				className: 'midpoint-handle',
				html: '',
				iconSize: [10, 10],
				iconAnchor: [5, 5]
			})
		});

		let newIndex = -1;

		marker.on('dragstart', () => {
			newIndex = indexA + 1;
			this.verts.splice(newIndex, 0, [midLat, midLng]);
			this.changed();
			marker.setIcon(
				L.divIcon({ className: 'vertex-handle', html: '', iconSize: [14, 14], iconAnchor: [7, 7] })
			);
		});

		marker.on('drag', (e) => {
			if (newIndex === -1) return;
			const pos = this.snapDrag(e.target as Leaflet.Marker);
			this.verts[newIndex] = [pos.lat, pos.lng];
			this.changed();
		});

		marker.on('dragend', () => {
			this.clearSnapIndicator();
			if (newIndex !== -1) this.rebuild();
		});

		marker.on('click', (e) => {
			L.DomEvent.stopPropagation(e);
			if (newIndex !== -1) return;
			this.verts.splice(indexA + 1, 0, [midLat, midLng]);
			this.changed();
			setTimeout(() => {
				if (!this.destroyed) this.rebuild();
			}, 0);
		});

		marker.addTo(this.markerGroup!);
	}
}
