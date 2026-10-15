<!-- src/routes/admin/requests/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import type { AdminAreaRequest } from '$lib/features/area-requests/server/requests';
	import RequestMapPreview from '$lib/features/area-requests/components/RequestMapPreview.svelte';
	import CreateAreaForm from '$lib/features/area-requests/components/CreateAreaForm.svelte';
	import AdminPage from '$lib/components/admin/AdminPage.svelte';
	import { geoJsonToLatLngs, calcAreaSqKm } from '$lib/features/map/geometry';
	import { relativeTime } from '$lib/utils/time';
	import type { GeoJsonGeometry } from '$lib/features/area-management/types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let selectedId = $state<number | null>(null);
	let mobileTab = $state<'list' | 'map'>('list');

	const selectedRequest = $derived<AdminAreaRequest | null>(
		data.requests.find((r) => r.id === selectedId) ?? null
	);

	const statuses = ['pending', 'approved', 'rejected', 'all'] as const;

	const banner = $derived.by(() => {
		if (form?.message) return { kind: 'error' as const, text: form.message };
		if (form && 'areaName' in form && form.areaName) {
			return { kind: 'success' as const, text: `Created area "${form.areaName}".` };
		}
		if (form?.success) return { kind: 'success' as const, text: 'Request resolved.' };
		return null;
	});

	function selectRequest(req: AdminAreaRequest): void {
		selectedId = selectedId === req.id ? null : req.id;
		mobileTab = 'map';
	}

	interface AreaStats {
		areaSqKm: number;
		areaSqMi: number;
		vertexCount: number;
	}

	function computeAreaStats(geofence: string): AreaStats | null {
		let parsed: unknown;
		try {
			parsed = JSON.parse(geofence);
		} catch {
			return null;
		}
		if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return null;

		const rings = geoJsonToLatLngs(parsed as GeoJsonGeometry);
		const vertexCount = rings.reduce((sum, ring) => sum + ring.length, 0);
		const areaSqKm = rings.reduce((sum, ring) => sum + calcAreaSqKm(ring), 0);
		if (areaSqKm <= 0) return null;

		return { areaSqKm, areaSqMi: areaSqKm * 0.386102, vertexCount };
	}
</script>

<AdminPage
	title="Area requests"
	meta="{data.statusCounts.pending} pending · {data.statusCounts
		.all} total. Select a request to preview it on the map."
	{banner}
>
	<div class="toolbar">
		<nav class="segmented" aria-label="Filter by status">
			{#each statuses as s (s)}
				<a
					href="/admin/requests?status={s}"
					aria-current={data.statusFilter === s ? 'page' : undefined}
					>{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
					<span class="count" class:pending={s === 'pending' && data.statusCounts.pending > 0}
						>{data.statusCounts[s]}</span
					></a
				>
			{/each}
		</nav>

		<div class="segmented mobile-tabs" role="group" aria-label="View">
			<button type="button" aria-pressed={mobileTab === 'list'} onclick={() => (mobileTab = 'list')}
				>List</button
			>
			<button type="button" aria-pressed={mobileTab === 'map'} onclick={() => (mobileTab = 'map')}
				>Map</button
			>
		</div>
	</div>

	<div class="split-layout">
		<div class="list-panel" class:mobile-hidden={mobileTab === 'map'}>
			{#if data.requests.length === 0}
				<p class="empty panel-empty">
					{data.statusFilter === 'pending'
						? 'No pending requests — all caught up.'
						: 'No requests match this filter.'}
				</p>
			{:else}
				<ul class="request-list">
					{#each data.requests as req (req.id)}
						{@const stats = computeAreaStats(req.geofence)}
						<li class="request-item" class:selected={selectedId === req.id}>
							<button
								type="button"
								class="request-header"
								aria-expanded={selectedId === req.id}
								onclick={() => selectRequest(req)}
							>
								<span class="badges">
									<span class="badge {req.type === 'addition' ? 'badge-good' : 'badge-danger'}"
										>{req.type === 'addition' ? 'Add' : 'Remove'}</span
									>
									<span
										class="badge"
										class:badge-warn={req.status === 'pending'}
										class:badge-good={req.status === 'approved'}
										class:badge-danger={req.status === 'rejected'}>{req.status}</span
									>
								</span>
								<span class="who">{req.username}</span>
								<span class="when" title={new Date(req.submittedAt).toLocaleString()}
									>{relativeTime(req.submittedAt)}</span
								>
							</button>

							{#if req.existingAreaName}
								<p class="existing">Area: <b>{req.existingAreaName}</b></p>
							{/if}
							<blockquote class="user-note">{req.userNote}</blockquote>
							{#if req.adminNote}
								<p class="admin-note"><span class="hint">Admin note:</span> {req.adminNote}</p>
							{/if}
							{#if stats}
								<p class="hint stats">
									{stats.areaSqMi.toFixed(2)} mi² · {stats.areaSqKm.toFixed(2)} km² ·
									{stats.vertexCount} vertices
								</p>
							{/if}

							{#if req.status === 'pending'}
								<div class="resolve">
									{#if req.type === 'removal'}
										<form method="POST" action="?/resolveRequest" use:enhance class="resolve-form">
											<input type="hidden" name="id" value={req.id} />
											<input type="hidden" name="status" value="approved" />
											<input
												class="input"
												type="text"
												name="adminNote"
												placeholder="Admin note (optional)"
												aria-label="Admin note"
											/>
											<button type="submit" class="btn btn-success">Approve and disable area</button
											>
										</form>
									{:else}
										<CreateAreaForm {req} />
									{/if}
									<form method="POST" action="?/resolveRequest" use:enhance class="resolve-form">
										<input type="hidden" name="id" value={req.id} />
										<input type="hidden" name="status" value="rejected" />
										<input
											class="input"
											type="text"
											name="adminNote"
											placeholder="Reason for rejecting (optional)"
											aria-label="Rejection note"
										/>
										<button type="submit" class="btn btn-danger">Reject</button>
									</form>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="map-panel" class:mobile-hidden={mobileTab === 'list'}>
			<RequestMapPreview
				areas={data.areas}
				tileSettings={data.tileSettings}
				startView={data.startView}
				selected={selectedRequest}
			/>
		</div>
	</div>
</AdminPage>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.count.pending {
		background: rgba(251, 191, 36, 0.2);
		color: var(--warning);
	}

	/* Two classes so it outranks the shared .segmented display rule. */
	.toolbar .mobile-tabs {
		display: none;
	}

	.split-layout {
		display: flex;
		gap: 1.25rem;
		height: 75vh;
	}

	.list-panel {
		width: 440px;
		flex-shrink: 0;
		overflow-y: auto;
		min-height: 0;
	}

	.panel-empty {
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 12px;
		padding: 1.25rem 1.4rem;
	}

	.map-panel {
		flex: 1;
		min-height: 0;
		display: flex;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid #1a2540;
	}

	.request-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.request-item {
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 12px;
		padding: 1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.request-item.selected {
		border-color: #38bdf8;
		box-shadow: 0 0 0 1px #38bdf8;
	}

	.request-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		min-height: 36px;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}

	.badges {
		display: flex;
		gap: 0.3rem;
		text-transform: capitalize;
	}

	.who {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.when {
		margin-left: auto;
		font-size: var(--text-sm);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.request-item p {
		margin: 0;
	}

	.existing {
		font-size: var(--text-sm);
		color: var(--text);
	}

	.user-note {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		background: #0a1020;
		font-size: var(--text-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.admin-note {
		font-size: var(--text-sm);
		color: var(--accent-soft);
	}

	.stats {
		font-size: var(--text-sm);
	}

	.resolve {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border-top: 1px solid #1a2540;
		padding-top: 0.75rem;
	}

	.resolve-form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	@media (max-width: 768px) {
		.toolbar .mobile-tabs {
			display: inline-flex;
		}

		.split-layout {
			flex-direction: column;
			height: auto;
		}

		.list-panel {
			width: 100%;
			height: 65vh;
		}

		.map-panel {
			flex: none;
			height: 65vh;
		}

		.mobile-hidden {
			display: none !important;
		}
	}
</style>
