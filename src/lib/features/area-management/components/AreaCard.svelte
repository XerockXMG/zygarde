<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Area, ToggleField, Permissions } from '../types';
	import type { VoteDetail } from '$lib/features/voting/server/votes';
	import type { TargetConfig } from '$lib/features/voting/server/targets';
	import type { AutoscaleConfig } from '$lib/features/autoscale/types';
	import WorkerAutoscaleForm from '$lib/features/autoscale/components/WorkerAutoscaleForm.svelte';
	import { mapState } from '$lib/features/map/stores/mapState.svelte';
	import { editState } from '$lib/features/map/stores/editState.svelte';
	import { voteState } from '$lib/features/voting/stores/voteState.svelte';
	import { batchState } from '../stores/batchState.svelte';
	import { canVisuallyEditPolygon } from '$lib/features/map/geometry';
	import WorkerForm from './WorkerForm.svelte';
	import RouteGenPanel from './RouteGenPanel.svelte';
	import VoteButton from '$lib/features/voting/components/VoteButton.svelte';
	import VoteTargetForm from '$lib/features/voting/components/VoteTargetForm.svelte';
	import RequestRemovalButton from '$lib/features/area-requests/components/RequestRemovalButton.svelte';
	import SpawnpointDetail from '$lib/features/spawnpoints/components/SpawnpointDetail.svelte';
	import GeofenceHistory from '$lib/features/map/components/GeofenceHistory.svelte';
	import { kojiSyncNotice } from '../kojiSyncNotice';
	import type { ArchiveEntry } from '$lib/features/map/server/geofenceArchive';
	import type { RouteRunsByArea } from '../server/routeRuns';

	let {
		area,
		areas,
		permissions,
		expanded,
		onSelect,
		tokenTotal,
		targetConfig,
		autoscaleConfig,
		voteDetails,
		loggedIn,
		geofenceHistory,
		routeRuns
	}: {
		area: Area;
		areas: Area[];
		permissions: Permissions;
		expanded: boolean;
		onSelect: () => void;
		tokenTotal: number;
		targetConfig: TargetConfig | undefined;
		autoscaleConfig: AutoscaleConfig | undefined;
		voteDetails: VoteDetail[];
		loggedIn: boolean;
		geofenceHistory: ArchiveEntry[];
		routeRuns: RouteRunsByArea[number] | undefined;
	} = $props();

	const TOGGLE_FIELDS: { field: ToggleField; label: string }[] = [
		{ field: 'enabled', label: 'Enabled' },
		{ field: 'enable_pokemon', label: 'Pokemon' },
		{ field: 'enable_forts', label: 'Forts' },
		{ field: 'enable_quests', label: 'Quests' },
		{ field: 'enable_rare_pokemon', label: 'Rare Pokemon' }
	];

	const target = $derived(voteState.targets[area.id] ?? null);

	let showRawGeofence = $state(false);

	function editGeofence(): void {
		if (!mapState.map || !mapState.L || !mapState.geofenceGroup) return;
		mapState.selectedId = area.id;
		mapState.mobileView = 'map';
		editState.enterEditMode(
			area,
			areas,
			mapState.L,
			mapState.map,
			mapState.polygonMap,
			mapState.geofenceGroup,
			(a, sel) => mapState.getPolyStyle(a, sel),
			mapState.selectedId
		);
	}
</script>

<div
	id="area-card-{area.id}"
	class="area-card"
	class:expanded
	class:mine={(voteState.allocations[area.id] ?? 0) > 0}
>
	<div class="card-summary">
		{#if batchState.batchMode}
			<button
				class="batch-checkbox"
				class:checked={batchState.batchSelectedIds.has(area.id)}
				onclick={() => batchState.toggleBatchSelect(area.id)}
				title={batchState.batchSelectedIds.has(area.id) ? 'Deselect' : 'Select for batch'}
				>{batchState.batchSelectedIds.has(area.id) ? '☑' : '☐'}</button
			>
		{/if}
		<button class="card-main" onclick={onSelect}>
			<span class="status-dot" class:enabled={area.enabled}></span>
			<span class="card-name">{area.name}</span>
			{#if permissions.canEdit}
				<span class="worker-pills">
					{#if area.pokemon_mode.workers > 0}
						<span class="pill pokemon">{area.pokemon_mode.workers}P</span>
					{/if}
					{#if area.fort_mode.workers > 0}
						<span class="pill fort">{area.fort_mode.workers}F</span>
					{/if}
					{#if area.quest_mode.workers > 0}
						<span class="pill quest">{area.quest_mode.workers}Q</span>
					{/if}
					{#if area.rare_pokemon_mode.workers > 0}
						<span class="pill rare">{area.rare_pokemon_mode.workers}R</span>
					{/if}
				</span>
			{/if}
			<span
				class="pill weighted"
				title={target !== null
					? `Community tokens funding this area (target: ${target})`
					: 'Community tokens funding this area'}
				>⚖ {tokenTotal}{#if target !== null}/{target}{/if}</span
			>
		</button>
		<VoteButton areaId={area.id} {loggedIn} />
	</div>

	{#if expanded && permissions.canEdit}
		<div class="card-detail">
			<div class="toggles">
				{#each TOGGLE_FIELDS as { field, label } (field)}
					<form method="POST" action="?/toggleField" use:enhance>
						<input type="hidden" name="areaId" value={area.id} />
						<input type="hidden" name="field" value={field} />
						<input type="hidden" name="value" value={String(!area[field])} />
						<button type="submit" class="toggle" class:on={area[field]}>
							{label}
						</button>
					</form>
				{/each}
			</div>

			{#if !autoscaleConfig?.enabled}
				<WorkerForm {area} />
			{/if}

			<WorkerAutoscaleForm {area} {autoscaleConfig} hasTarget={!!targetConfig} />

			<VoteTargetForm
				{area}
				{targetConfig}
				maxPokemonWorkers={autoscaleConfig?.maxPokemonWorkers ?? area.pokemon_mode.workers}
			/>

			<RouteGenPanel {area} {routeRuns} />

			<div class="geofence-section">
				{#if canVisuallyEditPolygon(area.geofence)}
					<button class="btn-edit-geofence" onclick={editGeofence}>✏ Edit Geofence</button>
				{:else if area.geofence?.type === 'MultiPolygon'}
					<p class="geofence-note">
						Multi-part geofence — visual editing not supported. Paste replacement GeoJSON below.
					</p>
				{:else if area.geofence?.type === 'Polygon'}
					<p class="geofence-note">
						Complex geofence (holes or too few points) — visual editing not supported. Paste
						replacement GeoJSON below.
					</p>
				{:else}
					<p class="geofence-note">No geofence set. Paste GeoJSON below to add one.</p>
				{/if}

				<button
					type="button"
					class="btn-toggle-raw"
					onclick={() => (showRawGeofence = !showRawGeofence)}
				>
					{showRawGeofence ? '▾' : '▸'} Raw GeoJSON
				</button>

				{#if showRawGeofence}
					{#if editState.editingAreaId === area.id}
						<p class="geofence-note">
							Finish or discard the visual edit above before pasting raw GeoJSON.
						</p>
					{:else}
						<form
							method="POST"
							action="?/saveGeofence"
							use:enhance={() => {
								return async ({ result, update }) => {
									await update({ reset: false });
									const notice = result.type === 'success' ? kojiSyncNotice(result.data) : null;
									if (notice) alert(notice);
								};
							}}
						>
							<input type="hidden" name="areaId" value={area.id} />
							<textarea
								name="geofence"
								rows="6"
								placeholder="Paste a GeoJSON Polygon here"
								value={area.geofence ? JSON.stringify(area.geofence, null, 2) : ''}></textarea>
							{#if permissions.canSyncKoji}
								<label class="koji-sync">
									<input type="checkbox" name="syncKoji" value="1" />
									Also update in Kōji
								</label>
							{/if}
							<button type="submit">Save Raw GeoJSON</button>
						</form>
					{/if}
				{/if}

				<GeofenceHistory history={geofenceHistory} canSyncKoji={permissions.canSyncKoji} />
			</div>

			{#if voteDetails.length > 0}
				<div class="voters">
					<div class="voters-header">ACTIVE USERS ({voteDetails.length} backers)</div>
					<div class="voter-chips">
						{#each voteDetails as voter (voter.discordId)}
							<span class="voter-chip">
								{voter.isPrimary ? '♥' : '★'}
								{voter.username}
								<span class="voter-tier">({voter.tierName}) · {voter.amount} tok</span>
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if expanded && loggedIn && !permissions.canEdit}
		<div class="card-detail">
			<RequestRemovalButton {area} />
		</div>
	{/if}

	{#if expanded && permissions.canSeeSpawnpoints}
		<div class="card-detail">
			<SpawnpointDetail {area} />
		</div>
	{/if}
</div>

<style>
	.area-card {
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 8px;
	}

	/* Areas the viewer has put tokens on. */
	.area-card.mine {
		box-shadow: inset 3px 0 0 var(--token);
	}

	.card-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.8rem;
	}

	.card-main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		color: var(--text);
		cursor: pointer;
		text-align: left;
		padding: 0;
		min-width: 0;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #475569;
		flex-shrink: 0;
	}

	.status-dot.enabled {
		background: #10b981;
	}

	.batch-checkbox {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-md);
		line-height: 1;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}

	.batch-checkbox.checked {
		color: var(--accent);
	}

	.card-name {
		flex: 1;
		font-weight: 600;
	}

	.worker-pills {
		display: flex;
		gap: 0.3rem;
	}

	.pill {
		font-size: var(--text-xs);
		padding: 0.1rem 0.4rem;
		border-radius: 8px;
		background: #162040;
		color: var(--text-secondary);
	}

	.pill.weighted {
		color: var(--violet);
	}

	.card-detail {
		border-top: 1px solid #1a2540;
		padding: 0.6rem 0.8rem;
	}

	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.4rem;
	}

	.toggles form {
		display: contents;
	}

	.toggle {
		background: #162040;
		border: 1px solid #1a2540;
		border-radius: 6px;
		color: var(--text-muted);
		font-size: var(--text-xs);
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}

	.toggle.on {
		border-color: rgba(16, 185, 129, 0.5);
		color: var(--success);
	}

	.voters {
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid #1a2540;
	}

	.voters-header {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}

	.voter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.voter-chip {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		background: #162040;
		border-radius: 8px;
		padding: 0.15rem 0.5rem;
	}

	.voter-tier {
		color: var(--text-muted);
	}

	.geofence-section {
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid #1a2540;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.geofence-note {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
	}

	.btn-edit-geofence {
		align-self: flex-start;
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.4);
		color: var(--warning);
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.3rem 0.7rem;
		border-radius: 6px;
		cursor: pointer;
	}

	.btn-toggle-raw {
		align-self: flex-start;
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.03em;
		cursor: pointer;
		padding: 0.1rem 0;
	}

	.btn-toggle-raw:hover {
		color: var(--text-secondary);
	}

	.geofence-section form {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.geofence-section textarea {
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 6px;
		color: var(--text);
		font-family: monospace;
		font-size: var(--text-xs);
		padding: 0.5rem;
		resize: vertical;
	}

	.koji-sync {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: var(--text-xs);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.geofence-section form button[type='submit'] {
		align-self: flex-start;
		background: #162040;
		border: 1px solid #1a2540;
		border-radius: 6px;
		color: var(--accent);
		font-size: var(--text-xs);
		padding: 0.35rem 0.75rem;
		cursor: pointer;
	}
</style>
