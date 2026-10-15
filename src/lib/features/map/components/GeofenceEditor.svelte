<script lang="ts">
	/**
	 * Geofence visual editor toolbar overlay.
	 *
	 * Positioned absolutely at the top-centre of the map panel while an area
	 * is in edit mode. Shows the area name, live vertex count, and Save /
	 * Discard actions. Hidden when editState.editingAreaId is null.
	 *
	 * Rendered inside MapPanel's .map-wrap, which already has
	 * position: relative for this absolute positioning to work.
	 */
	import { editState } from '../stores/editState.svelte';
	import { mapState } from '../stores/mapState.svelte';
	import type { MapData } from '../types';

	let { mapData }: { mapData: MapData } = $props();

	const editingArea = $derived(mapData.areas.find((a) => a.id === editState.editingAreaId));

	function onPolygonClick(areaId: number): void {
		mapState.selectedId = areaId;
	}

	function discard(): void {
		if (!mapState.map || !mapState.L || !mapState.geofenceGroup) return;
		editState.exitEditMode(
			false,
			mapState.L,
			mapState.map,
			mapState.polygonMap,
			mapState.geofenceGroup,
			(a, sel) => mapState.getPolyStyle(a, sel),
			mapState.selectedId,
			mapData.areas,
			onPolygonClick
		);
		mapState.rebuildGeofences(mapData);
	}

	function save(): void {
		if (!mapState.map || !mapState.L || !mapState.geofenceGroup) return;
		editState.exitEditMode(
			true,
			mapState.L,
			mapState.map,
			mapState.polygonMap,
			mapState.geofenceGroup,
			(a, sel) => mapState.getPolyStyle(a, sel),
			mapState.selectedId,
			mapData.areas,
			onPolygonClick
		);
		mapState.rebuildGeofences(mapData);
	}
</script>

{#if editState.editingAreaId !== null || editState.editSaving}
	<div class="edit-toolbar">
		<div class="edit-info">
			<span class="edit-title">Editing: {editingArea?.name ?? '…'}</span>
			<span class="edit-hint">
				{editState.editingVertices.length} vertices · drag to move · right-click to delete · click/drag
				edge midpoints to add · snaps to nearby geofences
			</span>
		</div>
		<div class="edit-actions">
			{#if mapData.permissions.canSyncKoji}
				<label
					class="koji-sync"
					title="Update the Kōji geofence with the same name — keeps its parent, projects, mode, and properties"
				>
					<input
						type="checkbox"
						bind:checked={editState.syncKoji}
						disabled={editState.editSaving}
					/>
					Also update in Kōji
				</label>
			{/if}
			<button class="btn-discard" onclick={discard}>✕ Discard</button>
			<button class="btn-save-edit" disabled={editState.editSaving} onclick={save}>
				{editState.editSaving ? 'Saving…' : '✓ Save Changes'}
			</button>
		</div>
	</div>
{/if}

<style>
	.edit-toolbar {
		position: absolute;
		top: 0.85rem;
		left: 50%;
		transform: translateX(-50%);
		background: #0d1425;
		border: 1px solid #fbbf24;
		border-radius: 10px;
		padding: 0.7rem 1rem;
		display: flex;
		align-items: center;
		gap: 1.25rem;
		z-index: 800;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		pointer-events: all;
	}

	.edit-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.edit-title {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--warning);
		letter-spacing: 0.03em;
	}

	.edit-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-weight: 600;
	}

	.edit-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.koji-sync {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.btn-discard {
		font-size: var(--text-sm);
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.4rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		background: transparent;
		border: 1px solid #334155;
		color: var(--text-muted);
		transition:
			border-color 0.15s,
			color 0.15s;
	}

	.btn-discard:hover {
		border-color: #475569;
		color: var(--text-secondary);
	}

	.btn-save-edit {
		font-size: var(--text-sm);
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.4rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		background: rgba(251, 191, 36, 0.15);
		border: 1px solid #fbbf24;
		color: var(--warning);
		transition: background 0.15s;
	}

	.btn-save-edit:hover:not(:disabled) {
		background: rgba(251, 191, 36, 0.28);
	}
	.btn-save-edit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Vertex and midpoint marker overrides (global — Leaflet uses its own DOM) */
	:global(.vertex-handle) {
		background: #fbbf24;
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
		cursor: grab !important;
		transition: transform 0.1s;
	}

	:global(.vertex-handle:hover) {
		transform: scale(1.45);
	}

	:global(.leaflet-marker-draggable.vertex-handle),
	:global(.leaflet-marker-draggable .vertex-handle) {
		cursor: grab !important;
	}

	:global(.leaflet-dragging .vertex-handle) {
		cursor: grabbing !important;
		transform: scale(1.3);
	}

	:global(.midpoint-handle) {
		background: rgba(251, 191, 36, 0.4);
		border: 1.5px dashed rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
		cursor: cell !important;
		transition:
			transform 0.1s,
			background 0.1s;
	}

	:global(.midpoint-handle:hover) {
		background: rgba(251, 191, 36, 0.85);
		transform: scale(1.5);
	}
</style>
