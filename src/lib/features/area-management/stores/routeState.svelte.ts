/**
 * Single-area Kōji route generation state.
 *
 * Holds all the generation parameters and the current generation lifecycle
 * state (generating, error, preview, saving). Also provides the batch-mode
 * entry points (`generateRouteForBatch`/`saveRouteForBatch`) used by
 * `batchState`, so generation params stay consistent between single-area and
 * batch runs.
 */
import { invalidateAll } from '$app/navigation';
import { postForm } from '$lib/utils/postForm';
import type * as Leaflet from 'leaflet';
import type { Area } from '../types';

/** Preview route data returned by the Kōji endpoint. */
export interface PreviewRoute {
	areaId: number;
	coords: [number, number][];
	stats: Record<string, number> | null;
	cacheKey: string;
}

class RouteStateClass {
	// ── Panel / lifecycle state ─────────────────────────────────────────────

	/** Area ID for which the generation panel is open, or null. */
	routePanelAreaId = $state<number | null>(null);

	/** True while a Kōji request is in flight. */
	generating = $state(false);

	/** Error message from the most recent generation or save attempt, if any. */
	genError = $state<string | null>(null);

	/** Generated route awaiting confirmation (shown as a preview on the map). */
	previewRoute = $state<PreviewRoute | null>(null);

	/** True while the save request is in flight. */
	savingRoute = $state(false);

	/** Seconds elapsed since the current generation started. */
	genElapsed = $state(0);

	private _genTimer: ReturnType<typeof setInterval> | null = null;

	// ── Generation parameters (shared — only one panel open at a time) ──────
	genRouteType = $state<'spawnpoint' | 'bootstrap'>('spawnpoint');
	genRadius = $state(70);
	genMinPoints = $state(1);
	genMaxClusters = $state(0);
	genClustersMode = $state<'fixed' | 'per_worker'>('fixed');
	genClustersPerWorker = $state(10);
	genClusterMode = $state('Balanced');
	genCalcMode = $state('Radius');
	genTth = $state('All');

	// ── Panel helpers ───────────────────────────────────────────────────────

	/** Open the generation panel for the given area and reset route type to default. */
	openRoutePanel(areaId: number): void {
		this.routePanelAreaId = areaId;
		this.genError = null;
		this.genRouteType = 'spawnpoint';
	}

	/** Discard the current preview and close the route panel. */
	discardRoute(previewRouteGroup: Leaflet.LayerGroup | null): void {
		this.previewRoute = null;
		this.routePanelAreaId = null;
		this.genError = null;
		previewRouteGroup?.clearLayers();
	}

	// ── Map preview ─────────────────────────────────────────────────────────

	/** Draw the preview route polyline on the map. */
	drawPreviewRoute(
		coords: [number, number][],
		L: typeof Leaflet,
		previewRouteGroup: Leaflet.LayerGroup
	): void {
		previewRouteGroup.clearLayers();
		if (coords.length < 2) return;
		L.polyline(coords, { color: '#f472b6', weight: 2, opacity: 0.9, dashArray: '6 3' }).addTo(
			previewRouteGroup
		);
	}

	// ── Generation ──────────────────────────────────────────────────────────

	private _buildRequestBody(area: Area): Record<string, unknown> {
		const maxClusters =
			this.genClustersMode === 'per_worker'
				? this.genClustersPerWorker * area.pokemon_mode.workers
				: this.genMaxClusters;
		return {
			areaId: area.id,
			geofence: area.geofence,
			routeType: this.genRouteType,
			radius: this.genRadius,
			minPoints: this.genMinPoints,
			maxClusters,
			clusterMode: this.genClusterMode,
			calculationMode: this.genCalcMode,
			tth: this.genTth
		};
	}

	/** Stream a Kōji request for `area` and return the result. Throws on any error. */
	private async _streamGeneration(area: Area): Promise<{
		coords: [number, number][];
		stats: Record<string, number> | null;
		cacheKey: string;
	}> {
		const res = await fetch('/api/koji', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(this._buildRequestBody(area))
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({ message: res.statusText }));
			throw new Error(err.message ?? `HTTP ${res.status}`);
		}

		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const events = buffer.split('\n\n');
			buffer = events.pop() ?? '';
			for (const event of events) {
				if (!event.startsWith('data: ')) continue;
				const parsed = JSON.parse(event.slice(6));
				if (parsed.error) throw new Error(parsed.error);
				if (parsed.cacheKey) {
					return { coords: parsed.coords, stats: parsed.stats ?? null, cacheKey: parsed.cacheKey };
				}
			}
		}
		throw new Error('No result received from Kōji');
	}

	/**
	 * Generate a route for a single area: opens the SSE connection, tracks the
	 * elapsed timer, and on success stores the result in `previewRoute` and
	 * closes the panel.
	 */
	async generateRoute(area: Area, focusArea: (area: Area) => void): Promise<void> {
		if (this.generating) return;
		this.generating = true;
		this.genError = null;
		this.genElapsed = 0;
		this._genTimer = setInterval(() => {
			this.genElapsed += 1;
		}, 1000);

		try {
			const { coords, stats, cacheKey } = await this._streamGeneration(area);
			this.previewRoute = { areaId: area.id, coords, stats, cacheKey };
			this.routePanelAreaId = null;
			focusArea(area);
		} catch (e) {
			this.genError = e instanceof Error ? e.message : 'Network error — check KOJI_URL';
		} finally {
			this.generating = false;
			if (this._genTimer) clearInterval(this._genTimer);
			this._genTimer = null;
		}
	}

	/**
	 * Submit the current preview route to `saveRoute` and invalidate page data.
	 * On failure the preview is kept so the user can retry; the error names
	 * the kept cache file.
	 */
	async saveRoute(areaId: number, cacheKey: string): Promise<void> {
		this.savingRoute = true;
		this.genError = null;
		try {
			const result = await postForm('?/saveRoute', { areaId: String(areaId), cacheKey });
			if (!result.ok) {
				const keptKey =
					typeof result.data?.cacheKey === 'string' ? result.data.cacheKey : undefined;
				const extra = keptKey ? ` — cache file kept: route-backups/${keptKey}` : '';
				this.genError = (result.message ?? 'Save failed') + extra;
				return;
			}
			this.previewRoute = null;
			await invalidateAll();
		} finally {
			this.savingRoute = false;
		}
	}

	// ── Batch helpers (called by batchState) ────────────────────────────────

	/** Stream a Kōji request for a batch item. Throws on any error so the caller can mark it failed. */
	async generateRouteForBatch(area: Area): Promise<{ cacheKey: string; stops: number }> {
		const { coords, cacheKey } = await this._streamGeneration(area);
		return { cacheKey, stops: coords.length };
	}

	/** Save a batch-generated route. Throws on failure so the caller can mark it failed. */
	async saveRouteForBatch(areaId: number, cacheKey: string): Promise<void> {
		const result = await postForm('?/saveRoute', { areaId: String(areaId), cacheKey });
		if (!result.ok) throw new Error(result.message ?? 'Save failed');
	}
}

/** Singleton route generation state — import in RouteGenPanel, MapPanel, and batchState. */
export const routeState = new RouteStateClass();
