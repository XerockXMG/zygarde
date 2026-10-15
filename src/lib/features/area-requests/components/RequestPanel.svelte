<!-- src/lib/features/area-requests/components/RequestPanel.svelte -->
<script lang="ts">
	/**
	 * Area-request form + history panel, rendered at the bottom of the list
	 * panel. Two tabs: the active draw/select/submit form (only while
	 * request mode is active), and "My Requests" — always visible once the
	 * user has at least one request, so status updates stay visible after
	 * leaving request mode.
	 */
	import { requestState } from '../stores/requestState.svelte';
	import { editState } from '$lib/features/map/stores/editState.svelte';
	import type { RequestSummary } from '$lib/features/area-requests/server/requests';

	let { myRequests, loggedIn }: { myRequests: RequestSummary[]; loggedIn: boolean } = $props();

	let note = $state('');

	$effect(() => {
		requestState.myRequests = myRequests;
	});

	const canSubmit = $derived(
		requestState.finalGeofence !== null && note.trim().length > 0 && !requestState.submitting
	);

	async function handleSubmit(): Promise<void> {
		const ok = await requestState.submitRequest(note);
		if (ok) note = '';
	}

	function handleCancel(): void {
		requestState.exitRequestMode();
		note = '';
	}
</script>

{#if loggedIn && (requestState.requestModeActive || requestState.myRequests.length > 0)}
	<div class="request-panel" class:flash={requestState.formFlash}>
		<div class="tab-bar">
			<button
				class="tab"
				class:active={requestState.activeTab === 'form'}
				onclick={() => (requestState.activeTab = 'form')}>Request</button
			>
			<button
				class="tab"
				class:active={requestState.activeTab === 'history'}
				onclick={() => (requestState.activeTab = 'history')}
				>My Requests {requestState.myRequests.length > 0
					? `(${requestState.myRequests.length})`
					: ''}</button
			>
		</div>

		{#if requestState.activeTab === 'form'}
			{#if requestState.requestModeActive}
				<div class="mode-row">
					<span class="field-label">Mode</span>
					<div class="toggle-group">
						<button
							class="toggle-btn"
							class:active={requestState.drawMode === 'draw'}
							onclick={() => requestState.setDrawMode('draw')}>Draw</button
						>
						<button
							class="toggle-btn"
							class:active={requestState.drawMode === 'select'}
							onclick={() => requestState.setDrawMode('select')}>Select Area</button
						>
					</div>
					<p class="mode-hint">
						{#if requestState.drawMode === 'draw'}
							Click the map to place points. Click the starting point again to close the shape, then
							drag or right-click a point to adjust it.
						{:else}
							Click an existing area on the map to capture its geofence.
						{/if}
					</p>
				</div>

				<div class="field-row">
					<span class="field-label">Type</span>
					<div class="toggle-group">
						<button
							class="toggle-btn"
							class:active={requestState.requestType === 'addition'}
							disabled={requestState.selectedAreaId !== null}
							title={requestState.selectedAreaId !== null
								? 'An already-running area can only be requested for removal'
								: undefined}
							onclick={() => requestState.setRequestType('addition')}>Add Area</button
						>
						<button
							class="toggle-btn"
							class:active={requestState.requestType === 'removal'}
							onclick={() => requestState.setRequestType('removal')}>Remove Area</button
						>
					</div>
				</div>

				{#if requestState.drawMode === 'select' && requestState.selectedAreaName}
					<p class="captured-area">
						Captured: <strong>{requestState.selectedAreaName}</strong>
					</p>
				{:else if requestState.drawMode === 'draw'}
					<p class="vertex-hint">
						{requestState.vertexCount} point{requestState.vertexCount === 1 ? '' : 's'}
						{requestState.vertexCount < 3 ? '— need at least 3' : ''}
					</p>
				{/if}

				<div class="field-row">
					<label class="field-label" for="request-note">Note <span class="required">*</span></label>
					<textarea
						id="request-note"
						class="note-area"
						placeholder="Explain why you're requesting this change…"
						bind:value={note}
						rows="4"></textarea>
				</div>

				{#if requestState.submitError}
					<p class="error-msg">{requestState.submitError}</p>
				{/if}

				<div class="action-row">
					<button class="btn-submit" onclick={handleSubmit} disabled={!canSubmit}>
						{requestState.submitting ? 'Submitting…' : 'Submit Request'}
					</button>
					<button class="btn-cancel" onclick={handleCancel}>Cancel</button>
				</div>
			{:else}
				<p class="idle-hint">Activate request mode using the map button to draw a geofence.</p>
			{/if}
		{:else}
			<div class="filter-row">
				{#each ['all', 'pending', 'approved', 'rejected'] as s (s)}
					<button
						class="filter-btn"
						class:active={requestState.statusFilter === s}
						onclick={() => (requestState.statusFilter = s as typeof requestState.statusFilter)}
						>{s}</button
					>
				{/each}
			</div>

			{#if requestState.filteredRequests.length === 0}
				<p class="empty">
					{requestState.myRequests.length === 0
						? 'No requests yet.'
						: 'No requests match this filter.'}
				</p>
			{:else}
				<ul class="request-list">
					{#each requestState.filteredRequests as req (req.id)}
						<li class="request-item">
							<div class="request-header-row">
								<span class="type-badge type-{req.type}"
									>{req.type === 'addition' ? 'ADD' : 'REMOVE'}</span
								>
								<span class="status-badge status-{req.status}">{req.status}</span>
								<button
									class="btn-delete"
									title="Delete request"
									onclick={() => requestState.deleteRequest(req.id)}>✕</button
								>
							</div>
							{#if req.existingAreaName}
								<p class="req-area-name">{req.existingAreaName}</p>
							{/if}
							<p class="req-note">{req.userNote}</p>
							{#if req.adminNote}
								<p class="admin-note">
									<span class="admin-note-label">Admin:</span>
									{req.adminNote}
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.request-panel {
		flex-shrink: 0;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 10px;
		padding: 0.75rem;
		max-height: 50%;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.request-panel.flash {
		animation: panel-flash 0.7s ease-out;
	}

	@keyframes panel-flash {
		0% {
			border-color: #38bdf8;
			box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
		}
		60% {
			border-color: #38bdf8;
			box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
		}
		100% {
			border-color: #1a2540;
			box-shadow: none;
		}
	}

	.tab-bar {
		display: flex;
		gap: 0.4rem;
		border-bottom: 1px solid #1a2540;
		padding-bottom: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.tab {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.03em;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		border-radius: 4px;
	}

	.tab.active {
		color: var(--text);
	}

	.tab:hover {
		color: var(--text-secondary);
	}

	.mode-row,
	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.field-label {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.required {
		color: var(--token);
	}

	.toggle-group {
		display: flex;
		gap: 0.3rem;
	}

	.toggle-btn {
		background: #0a1020;
		border: 1px solid #1a2540;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.3rem 0.65rem;
		border-radius: 6px;
		cursor: pointer;
	}

	.toggle-btn.active {
		border-color: #f59e0b;
		color: var(--token);
		background: rgba(245, 158, 11, 0.08);
	}

	.toggle-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.mode-hint,
	.vertex-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
	}

	.captured-area {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 0;
	}

	.note-area {
		background: #070b14;
		border: 1px solid #1a2540;
		border-radius: 6px;
		color: var(--text);
		font-family: monospace;
		font-size: var(--text-xs);
		padding: 0.5rem;
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
	}

	.note-area:focus {
		outline: none;
		border-color: #f59e0b;
	}

	.error-msg {
		font-size: var(--text-xs);
		color: var(--danger);
		margin: 0;
	}

	.action-row {
		display: flex;
		gap: 0.5rem;
	}

	.btn-submit {
		flex: 1;
		background: rgba(245, 158, 11, 0.15);
		border: 1px solid #f59e0b;
		color: var(--token);
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.45rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
	}

	.btn-submit:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-submit:not(:disabled):hover {
		background: rgba(245, 158, 11, 0.25);
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid #1a2540;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.45rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
	}

	.btn-cancel:hover {
		border-color: #334155;
		color: var(--text-secondary);
	}

	.filter-row {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.filter-btn {
		background: none;
		border: 1px solid #1a2540;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
	}

	.filter-btn.active {
		color: var(--text);
		border-color: #334155;
	}

	.btn-delete {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
		padding: 4px 6px;
		cursor: pointer;
		line-height: 1;
		margin-left: auto;
		flex-shrink: 0;
	}

	.btn-delete:hover {
		color: var(--danger);
	}

	.idle-hint,
	.empty {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
		text-align: center;
		padding: 0.5rem 0;
	}

	.request-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.request-item {
		background: #070b14;
		border: 1px solid #1a2540;
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.request-header-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.type-badge {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.type-addition {
		background: rgba(16, 185, 129, 0.15);
		color: var(--success);
	}

	.type-removal {
		background: rgba(239, 68, 68, 0.15);
		color: var(--danger);
	}

	.status-badge {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.status-pending {
		background: rgba(245, 158, 11, 0.15);
		color: var(--token);
	}

	.status-approved {
		background: rgba(16, 185, 129, 0.15);
		color: var(--success);
	}

	.status-rejected {
		background: rgba(239, 68, 68, 0.15);
		color: var(--danger);
	}

	.req-area-name {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 0;
		font-style: italic;
	}

	.req-note {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 0;
	}

	.admin-note {
		font-size: var(--text-xs);
		color: var(--accent);
		margin: 0;
	}

	.admin-note-label {
		font-weight: 700;
	}
</style>
