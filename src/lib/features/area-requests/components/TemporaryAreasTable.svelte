<!-- src/lib/features/area-requests/components/TemporaryAreasTable.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { areaLink } from '$lib/features/area-management/deepLink';
	import type { TemporaryArea } from '../server/temporary';
	import type { TemporaryState } from '../temporaryView';

	interface Item {
		row: TemporaryArea;
		areaName: string | null;
		state: TemporaryState;
	}

	let { items }: { items: Item[] } = $props();

	const badgeClass: Record<TemporaryState, string> = {
		scheduled: 'badge-accent',
		active: 'badge-good',
		warned: 'badge-warn',
		'shut-off': 'badge-danger',
		deleted: ''
	};

	function confirmPermanent(event: MouseEvent) {
		if (
			!confirm(
				'Stop tracking this area as temporary? It will stay on and never shut off automatically.'
			)
		) {
			event.preventDefault();
		}
	}

	function stateLabel(item: Item): string {
		if (item.state === 'shut-off' && item.row.disabledAt) {
			return `shut off ${item.row.disabledAt.slice(0, 10)}`;
		}
		return item.state;
	}
</script>

{#if items.length === 0}
	<p class="empty">No temporary areas.</p>
{:else}
	<div class="table-wrap">
		<table class="data-table">
			<thead>
				<tr>
					<th scope="col">Area</th>
					<th scope="col">Requester</th>
					<th scope="col">Start</th>
					<th scope="col">End</th>
					<th scope="col">State</th>
					<th scope="col">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.row.areaId)}
					{@const formId = `temp-${item.row.areaId}`}
					<tr>
						<td>
							{#if item.areaName}
								<a href={areaLink(item.row.areaId)}>{item.areaName}</a>
							{:else}
								<span class="hint"
									>Area #{item.row.areaId}{item.state === 'deleted' ? ' (deleted)' : ''}</span
								>
							{/if}
						</td>
						<td>{item.row.username}</td>
						{#if item.state === 'deleted'}
							<td>{item.row.startsOn}</td>
							<td>{item.row.expiresOn}</td>
						{:else}
							<td>
								<input
									class="input"
									type="date"
									name="startsOn"
									form={formId}
									value={item.row.startsOn}
									disabled={item.row.startedAt !== null}
									aria-label="Start date"
								/>
							</td>
							<td>
								<input
									class="input"
									type="date"
									name="expiresOn"
									form={formId}
									value={item.row.expiresOn}
									required
									aria-label="End date"
								/>
							</td>
						{/if}
						<td><span class="badge {badgeClass[item.state]}">{stateLabel(item)}</span></td>
						<td>
							<form
								id={formId}
								method="POST"
								action="?/setTemporaryDates"
								use:enhance={() =>
									async ({ update }) =>
										// Keep the edited dates on screen: a form reset would revert them
										update({ reset: false })}
								class="actions"
							>
								<input type="hidden" name="areaId" value={item.row.areaId} />
								{#if item.state !== 'deleted'}
									<button type="submit" class="btn btn-primary">Save dates</button>
								{/if}
								<button
									type="submit"
									class="btn"
									formaction="?/clearTemporary"
									onclick={confirmPermanent}>Make permanent</button
								>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
</style>
