/**
 * Area-request form/mode state — the "draw a new area" vs. "select an
 * existing area" toggle, the addition/removal type, the note field, and
 * the submitter's own request history.
 *
 * Draw-mode vertex data lives in `editState` (Phase 4b's editor, reused via
 * `enterDrawMode`/`addDrawVertex`/`exitDrawMode`) — this store reads it
 * live rather than duplicating it, so `finalGeofence` always reflects the
 * current drawing without this store needing any Leaflet objects itself.
 * All Leaflet-parameter-taking calls into `editState`/`mapState` are made
 * by `MapPanel.svelte`, which reacts to this store's plain state — the
 * same division of labor `AreaCard.svelte` already uses for geofence
 * editing.
 */
import { invalidateAll } from '$app/navigation';
import { postForm } from '$lib/utils/postForm';
import { editState } from '$lib/features/map/stores/editState.svelte';
import { isValidPolygonGeoJson, latLngsToGeoJson } from '$lib/features/map/geometry';
import type { Area, GeoJsonGeometry } from '$lib/features/area-management/types';
import type {
	RequestSummary,
	RequestStatus,
	RequestType
} from '$lib/features/area-requests/server/requests';

class RequestStateClass {
	requestModeActive = $state(false);
	drawMode = $state<'draw' | 'select'>('draw');
	requestType = $state<RequestType>('addition');
	selectedAreaId = $state<number | null>(null);
	selectedAreaName = $state<string | null>(null);
	selectedAreaGeofence = $state<GeoJsonGeometry | null>(null);

	submitting = $state(false);
	submitError = $state<string | null>(null);

	myRequests = $state<RequestSummary[]>([]);
	activeTab = $state<'form' | 'history'>('form');
	statusFilter = $state<RequestStatus | 'all'>('all');
	formFlash = $state(false);

	/** Number of vertices in the current draft, for the "N points" hint. */
	get vertexCount(): number {
		if (this.drawMode === 'draw') return editState.editingVertices.length;
		if (this.selectedAreaGeofence?.type === 'Polygon') {
			return Math.max(0, this.selectedAreaGeofence.coordinates[0].length - 1);
		}
		return 0;
	}

	/** The geofence to submit, or null if not yet ready. */
	get finalGeofence(): GeoJsonGeometry | null {
		if (this.drawMode === 'draw') {
			return editState.editingVertices.length >= 3
				? latLngsToGeoJson(editState.editingVertices)
				: null;
		}
		return this.selectedAreaGeofence;
	}

	get filteredRequests(): RequestSummary[] {
		if (this.statusFilter === 'all') return this.myRequests;
		return this.myRequests.filter((r) => r.status === this.statusFilter);
	}

	enterRequestMode(): void {
		this.requestModeActive = true;
		this.drawMode = 'draw';
		this.requestType = 'addition';
		this.selectedAreaId = null;
		this.selectedAreaName = null;
		this.selectedAreaGeofence = null;
		this.submitError = null;
		this.activeTab = 'form';
	}

	exitRequestMode(): void {
		this.requestModeActive = false;
		this.selectedAreaId = null;
		this.selectedAreaName = null;
		this.selectedAreaGeofence = null;
		this.submitError = null;
	}

	/**
	 * An area captured via Select Area mode can only ever back a removal
	 * request — its geofence already belongs to a running area, so an
	 * "addition" request for it would be a no-op the server would reject
	 * anyway. Ignore attempts to switch to 'addition' while one is selected.
	 */
	setRequestType(type: RequestType): void {
		if (type === 'addition' && this.selectedAreaId !== null) return;
		this.requestType = type;
	}

	setDrawMode(mode: 'draw' | 'select'): void {
		if (mode === this.drawMode) return;
		this.drawMode = mode;
		this.selectedAreaId = null;
		this.selectedAreaName = null;
		this.selectedAreaGeofence = null;
	}

	/** Capture an existing area's geofence for a removal request. */
	captureArea(area: Area): void {
		if (!area.geofence) return;
		this.selectedAreaId = area.id;
		this.selectedAreaName = area.name;
		this.selectedAreaGeofence = area.geofence;
		this.requestType = 'removal';
		this.drawMode = 'select';
	}

	flashForm(): void {
		this.activeTab = 'form';
		this.formFlash = true;
		setTimeout(() => {
			this.formFlash = false;
		}, 700);
	}

	async submitRequest(note: string): Promise<boolean> {
		const geofence = this.finalGeofence;
		if (!geofence) {
			this.submitError = 'Draw or select a geofence first.';
			return false;
		}
		if (this.requestType === 'addition' && !isValidPolygonGeoJson(geofence)) {
			this.submitError = 'Geofence must be a Polygon with at least 3 distinct points.';
			return false;
		}

		this.submitting = true;
		this.submitError = null;
		try {
			const result = await postForm('?/submitRequest', {
				type: this.requestType,
				geofence: JSON.stringify(geofence),
				...(this.selectedAreaId != null ? { existingAreaId: String(this.selectedAreaId) } : {}),
				...(this.selectedAreaName ? { existingAreaName: this.selectedAreaName } : {}),
				note
			});
			if (!result.ok) {
				this.submitError = result.message ?? 'Submission failed';
				return false;
			}
			this.exitRequestMode();
			this.activeTab = 'history';
			await invalidateAll();
			return true;
		} catch {
			this.submitError = 'Network error — please try again';
			return false;
		} finally {
			this.submitting = false;
		}
	}

	async deleteRequest(id: number): Promise<boolean> {
		const result = await postForm('?/deleteRequest', { id: String(id) });
		if (!result.ok) return false;
		this.myRequests = this.myRequests.filter((r) => r.id !== id);
		return true;
	}
}

/** Singleton request state — import in RequestButton, RequestRemovalButton, RequestPanel, and MapPanel. */
export const requestState = new RequestStateClass();
