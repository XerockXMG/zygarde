<!-- src/lib/features/map/components/GeofenceHistory.svelte -->
<script lang="ts">
	/**
	 * Admin-only collapsible list of archived geofence versions for an area.
	 * `history` comes from the page load (geofenceArchive.listGeofenceArchive),
	 * so restoring or deleting an entry refreshes it for free via SvelteKit's
	 * default use:enhance invalidateAll — no manual refetch needed.
	 */
	import { enhance } from '$app/forms';
	import { relativeTime } from '$lib/utils/time';
	import type { ArchiveEntry } from '../server/geofenceArchive';
	import { kojiSyncNotice } from '$lib/features/area-management/kojiSyncNotice';

	let { history, canSyncKoji = false }: { history: ArchiveEntry[]; canSyncKoji?: boolean } =
		$props();

	let expanded = $state(false);
	/** Off by default — restoring only updates Kōji when explicitly ticked. */
	let syncKoji = $state(false);
</script>

<div class="geofence-history">
	<button type="button" class="btn-history-toggle" onclick={() => (expanded = !expanded)}>
		<span class="field-label">Geofence History</span>
		<span class="history-caret">{expanded ? '▲' : '▼'}</span>
	</button>
	{#if expanded}
		{#if history.length > 0}
			{#if canSyncKoji}
				<label class="koji-sync">
					<input type="checkbox" bind:checked={syncKoji} />
					Also update in Kōji on restore
				</label>
			{/if}
			<div class="history-list">
				{#each history as entry (entry.id)}
					<div class="history-entry">
						<div class="history-meta">
							<span class="history-date" title={new Date(entry.archivedAt).toLocaleString()}
								>{relativeTime(entry.archivedAt)}</span
							>
							<span class="history-user">{entry.archivedBy}</span>
						</div>
						<span class="history-verts">{entry.vertexCount} pts</span>
						<div class="history-actions">
							<form
								method="POST"
								action="?/restoreGeofence"
								use:enhance={() => {
									return async ({ result, update }) => {
										await update();
										const notice = result.type === 'success' ? kojiSyncNotice(result.data) : null;
										if (notice) alert(notice);
									};
								}}
							>
								<input type="hidden" name="archiveId" value={entry.id} />
								{#if syncKoji}<input type="hidden" name="syncKoji" value="1" />{/if}
								<button class="btn-restore" type="submit">Restore</button>
							</form>
							<form method="POST" action="?/deleteGeofenceArchive" use:enhance>
								<input type="hidden" name="archiveId" value={entry.id} />
								<button class="btn-delete-archive" type="submit" title="Delete this archive entry"
									>✕</button
								>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="history-empty">No archived versions yet.</div>
		{/if}
	{/if}
</div>

<style>
	.geofence-history {
		display: flex;
		flex-direction: column;
		border: 1px solid #1a2540;
		border-radius: 8px;
		overflow: hidden;
	}

	.btn-history-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		background: rgba(71, 85, 105, 0.08);
		border: none;
		padding: 0.45rem 0.6rem;
		cursor: pointer;
		text-align: left;
	}

	.koji-sync {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.6rem;
		font-size: var(--text-xs);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.btn-history-toggle:hover {
		background: rgba(71, 85, 105, 0.15);
	}

	.field-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.history-caret {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.history-list {
		display: flex;
		flex-direction: column;
	}

	.history-entry {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border-top: 1px solid #1a2540;
	}

	.history-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
		overflow: hidden;
	}

	.history-date {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		font-family: monospace;
		white-space: nowrap;
	}

	.history-user {
		font-size: var(--text-xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.history-verts {
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-family: monospace;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.history-empty {
		padding: 0.55rem 0.6rem;
		font-size: var(--text-xs);
		color: var(--text-muted);
		border-top: 1px solid #1a2540;
	}

	.history-actions {
		display: flex;
		gap: 0.3rem;
		flex-shrink: 0;
	}

	.btn-restore {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 0.2rem 0.55rem;
		border-radius: 5px;
		cursor: pointer;
		background: rgba(167, 139, 250, 0.1);
		border: 1px solid rgba(167, 139, 250, 0.35);
		color: var(--violet);
	}

	.btn-restore:hover {
		background: rgba(167, 139, 250, 0.2);
	}

	.btn-delete-archive {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0.2rem 0.45rem;
		border-radius: 5px;
		cursor: pointer;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.25);
		color: var(--text-muted);
	}

	.btn-delete-archive:hover {
		background: rgba(239, 68, 68, 0.18);
		border-color: rgba(239, 68, 68, 0.5);
		color: var(--danger);
	}
</style>
