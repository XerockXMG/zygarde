<!-- src/lib/features/area-requests/components/RequestButton.svelte -->
<script lang="ts">
	/**
	 * Floating map-overlay entry point for area requests: a "Request Area"
	 * button that enters request mode, replaced by Confirm/Cancel while
	 * active, plus a hint describing the current draw/select sub-mode.
	 */
	import { requestState } from '../stores/requestState.svelte';
	import { mapState } from '$lib/features/map/stores/mapState.svelte';
	import { editState } from '$lib/features/map/stores/editState.svelte';
	import { batchState } from '$lib/features/area-management/stores/batchState.svelte';

	let { loggedIn }: { loggedIn: boolean } = $props();

	function handleEnter(): void {
		if (editState.editingAreaId != null) return;
		if (batchState.batchMode) batchState.toggleBatchMode();
		requestState.enterRequestMode();
	}

	function handleConfirm(): void {
		if (mapState.mobileView === 'map') {
			mapState.mobileView = 'list';
		} else {
			requestState.flashForm();
		}
	}

	function handleCancel(): void {
		requestState.exitRequestMode();
	}
</script>

{#if loggedIn}
	{#if requestState.requestModeActive}
		<div class="request-actions">
			<button class="btn-confirm" onclick={handleConfirm}>✓ Confirm Area</button>
			<button class="btn-cancel" onclick={handleCancel}>✕ Cancel</button>
		</div>
		<div class="draw-hint" class:select-mode={requestState.drawMode === 'select'}>
			{#if requestState.drawMode === 'draw'}
				Click to add points · click the starting point to close the shape
			{:else}
				Click an existing area to capture its geofence
			{/if}
		</div>
	{:else}
		<button class="request-btn" onclick={handleEnter} title="Request area addition or removal">
			＋ Request Area
		</button>
	{/if}
{/if}

<style>
	.request-btn {
		position: absolute;
		bottom: 2.5rem;
		right: 0.75rem;
		z-index: 1000;
		background: #0d1425;
		border: 1px solid #1a2540;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-weight: 700;
		letter-spacing: 0.03em;
		padding: 0.45rem 0.9rem;
		border-radius: 8px;
		cursor: pointer;
		white-space: nowrap;
	}

	.request-btn:hover {
		border-color: #f59e0b;
		color: var(--token);
		background: rgba(245, 158, 11, 0.08);
	}

	.request-actions {
		position: absolute;
		bottom: 2.5rem;
		right: 0.75rem;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		align-items: stretch;
	}

	.btn-confirm,
	.btn-cancel {
		font-size: var(--text-sm);
		font-weight: 700;
		letter-spacing: 0.03em;
		padding: 0.45rem 0.9rem;
		border-radius: 8px;
		cursor: pointer;
		white-space: nowrap;
		border: 1px solid;
	}

	.btn-confirm {
		background: rgba(56, 189, 248, 0.08);
		border-color: #38bdf8;
		color: var(--accent);
	}

	.btn-confirm:hover {
		background: rgba(56, 189, 248, 0.16);
	}

	.btn-cancel {
		background: #0d1425;
		border-color: #1a2540;
		color: var(--text-muted);
	}

	.btn-cancel:hover {
		border-color: #ef4444;
		color: var(--danger);
		background: rgba(239, 68, 68, 0.08);
	}

	.draw-hint {
		position: absolute;
		top: 0.65rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 800;
		background: rgba(13, 20, 37, 0.92);
		border: 1px solid #f59e0b;
		color: var(--token);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 0.35rem 0.85rem;
		border-radius: 6px;
		max-width: calc(100% - 1.5rem);
		text-align: center;
		pointer-events: none;
	}

	.draw-hint.select-mode {
		border-color: #38bdf8;
		color: var(--accent);
	}
</style>
