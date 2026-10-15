/**
 * Spawnpoint count state — the global mode toggle (all/recent/confirmed),
 * per-area cached counts, and fetch lifecycle. Counts are fetched lazily
 * from /api/spawnpoints and held in memory for the page session.
 *
 * Components consuming this store must be in Svelte 5 runes mode for
 * $state property changes to be tracked correctly.
 */
import { browser } from '$app/environment';
import type { Area, GeoJsonGeometry } from '$lib/features/area-management/types';
import type { SpawnpointMode, SpawnpointEntry } from '../types';

class SpawnpointStateClass {
	/** Which set of spawnpoints to count — drives all fetch requests. */
	mode = $state<SpawnpointMode>('all');

	/** Per-area counts keyed by area ID, populated as fetches complete. */
	counts = $state<Record<number, SpawnpointEntry>>({});

	/** Area IDs whose count is currently being fetched. */
	loadingIds = $state(new Set<number>());

	/** True while a Fetch All operation is in progress. */
	fetchingAll = $state(false);

	/** Whether the current user has permission to view spawnpoint counts. */
	canSee = $state(false);

	/** Whether the current user can force-refresh counts (admin only). */
	canFetch = $state(false);

	private _areas: Area[] = [];
	private _initialized = false;

	/**
	 * Sync permissions and areas from page data. Triggers an initial
	 * background fetch the first time canSee becomes true. Safe to call on
	 * every page data change.
	 */
	init(canSeeSpawnpoints: boolean, isAdmin: boolean, areas: Area[]): void {
		this._areas = areas;
		this.canFetch = isAdmin;
		const firstEnable = canSeeSpawnpoints && !this.canSee;
		this.canSee = canSeeSpawnpoints;
		if (firstEnable && !this._initialized) {
			this._initialized = true;
			this._fetchBatch(this._areas, false);
		}
	}

	/** Switch the active mode and refresh all counts. */
	setMode(mode: SpawnpointMode): void {
		if (mode === this.mode) return;
		this.mode = mode;
		this.counts = {};
		if (this.canSee) this._fetchBatch(this._areas, false);
	}

	/** Force-refresh the count for a single area (admin "Fetch Now"). Always bypasses the server cache. */
	async fetchArea(areaId: number, geofence: GeoJsonGeometry | null): Promise<void> {
		// _fetchOne already no-ops on a null geofence — no need to check twice.
		if (!this.canSee) return;
		await this._fetchOne(areaId, geofence, true);
	}

	/** Force-refresh counts for all areas (admin "Fetch All"). Batches requests 10 at a time. */
	async fetchAll(): Promise<void> {
		if (!this.canFetch) return;
		this.fetchingAll = true;
		try {
			await this._fetchBatch(this._areas, true);
		} finally {
			this.fetchingAll = false;
		}
	}

	private async _fetchBatch(areas: Area[], refresh: boolean): Promise<void> {
		const targets = areas.filter((a) => a.enabled);
		for (let i = 0; i < targets.length; i += 10) {
			await Promise.all(
				targets.slice(i, i + 10).map((a) => this._fetchOne(a.id, a.geofence, refresh))
			);
		}
	}

	private async _fetchOne(
		areaId: number,
		geofence: GeoJsonGeometry | null,
		refresh: boolean
	): Promise<void> {
		if (!browser || !geofence) return;

		this.loadingIds = new Set([...this.loadingIds, areaId]);
		try {
			const res = await fetch('/api/spawnpoints', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ areaId, mode: this.mode, refresh })
			});
			if (!res.ok) return;
			const entry: SpawnpointEntry = await res.json();
			this.counts = { ...this.counts, [areaId]: entry };
		} catch {
			// Network error — leave the count unset; the user can retry via Fetch Now/All.
		} finally {
			const next = new Set(this.loadingIds);
			next.delete(areaId);
			this.loadingIds = next;
		}
	}
}

/** Singleton spawnpoint state — import directly in any component that needs it. */
export const spawnpointState = new SpawnpointStateClass();
