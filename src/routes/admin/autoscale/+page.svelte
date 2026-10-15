<!-- src/routes/admin/autoscale/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AdminPage from '$lib/components/admin/AdminPage.svelte';
	import Panel from '$lib/components/admin/Panel.svelte';
	import { areaLink } from '$lib/features/area-management/deepLink';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const banner = $derived.by(() => {
		if (form?.message) return { kind: 'error' as const, text: form.message };
		if (form && 'autoscaleUpdatedCount' in form && typeof form.autoscaleUpdatedCount === 'number') {
			const n = form.autoscaleUpdatedCount;
			return {
				kind: 'success' as const,
				text:
					n > 0
						? `Autoscale sync ran — updated ${n} ${n === 1 ? 'area' : 'areas'}.`
						: 'Autoscale sync ran — no areas needed a change.'
			};
		}
		if (form?.success) return { kind: 'success' as const, text: 'Changes saved.' };
		return null;
	});

	const pendingCount = $derived(
		data.rows.filter((r) => r.scaledWorkers !== null && r.scaledWorkers !== r.currentWorkers).length
	);
</script>

<AdminPage
	title="Worker autoscale"
	meta="{data.rows.length} {data.rows.length === 1
		? 'area'
		: 'areas'} with autoscale · re-checked every {data.autoscaleIntervalMinutes} min"
	{banner}
>
	<div class="top-grid">
		<Panel title="Sync interval" hint="Applies from the next scheduled run.">
			<form
				method="POST"
				action="?/saveInterval"
				class="settings-form"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
			>
				<label class="field">
					<span class="field-label">Autoscale sync interval (minutes)</span>
					<input
						class="input"
						type="number"
						name="autoscaleIntervalMinutes"
						min="1"
						max="1440"
						value={data.autoscaleIntervalMinutes}
					/>
					<span class="hint">How often areas with autoscale enabled are re-checked.</span>
				</label>
				<div>
					<button type="submit" class="btn btn-primary">Save</button>
				</div>
			</form>
		</Panel>

		<Panel title="Run now">
			<div class="run-now">
				<p class="hint">
					Areas with autoscale enabled are re-checked every
					<b>{data.autoscaleIntervalMinutes} min</b>. Run a sync now to apply funding changes
					without waiting for the next one.
				</p>
				<form method="POST" action="?/runAutoscaleNow" use:enhance>
					<button type="submit" class="btn">Run autoscale sync now</button>
				</form>
			</div>
		</Panel>
	</div>

	<Panel
		title="Areas with autoscale"
		hint="Turn autoscale on or off from an area's card on the map page, or in bulk from Batch Mode. Targets resolve off each area's stored baseline."
	>
		{#if data.dragoniteError}
			<p class="empty">{data.dragoniteError}</p>
		{:else if data.rows.length === 0}
			<p class="empty">No areas have autoscale enabled.</p>
		{:else}
			{#if pendingCount > 0}
				<p class="hint pending">
					{pendingCount}
					{pendingCount === 1 ? 'area' : 'areas'} will change at the next sync.
				</p>
			{/if}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th scope="col">Area</th>
							<th scope="col" class="num">Tokens</th>
							<th scope="col" class="num">Funded</th>
							<th scope="col" class="num">Speed</th>
							<th scope="col" class="num">Workers now</th>
							<th scope="col" class="num">Next sync</th>
							<th scope="col" class="num">Baseline</th>
						</tr>
					</thead>
					<tbody>
						{#each data.rows as row (row.areaId)}
							<tr>
								<td>
									<a href={areaLink(row.areaId)} title="Show {row.name} on the map">{row.name}</a>
									{#if !row.areaEnabled}<span class="badge">Area disabled</span>{/if}
								</td>
								<td class="num">
									{row.tokens}{#if row.target !== null}<span class="muted">/{row.target}</span>{/if}
								</td>
								<td class="num">
									{#if row.fundedPct === null}
										<span
											class="badge badge-warn"
											title="Autoscale skips areas without a vote target">No target</span
										>
									{:else}
										{Math.round(row.fundedPct)}%
									{/if}
								</td>
								<td class="num">
									{#if row.tier !== null}
										<span
											class="badge"
											class:badge-good={row.tier === 100}
											class:badge-accent={row.tier === 75 || row.tier === 50}
											class:badge-danger={row.tier <= 25}>{row.tier}%</span
										>
									{:else}
										<span class="muted">—</span>
									{/if}
								</td>
								<td class="num">{row.currentWorkers}</td>
								<td class="num">
									{#if row.scaledWorkers === null}
										<span class="muted">—</span>
									{:else if row.scaledWorkers !== row.currentWorkers}
										<b class="change">{row.scaledWorkers}</b>
									{:else}
										{row.scaledWorkers}
									{/if}
								</td>
								<td class="num">{row.maxPokemonWorkers}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Panel>
</AdminPage>

<style>
	.top-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.settings-form .input {
		max-width: 10rem;
	}

	.run-now {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}

	.run-now p {
		margin: 0;
	}

	.run-now b {
		color: var(--text);
	}

	.pending {
		margin: 0 0 0.75rem;
	}

	td a {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

	td a:hover {
		color: var(--accent);
	}

	td .badge {
		margin-left: 0.4rem;
	}

	td.num .badge {
		margin-left: 0;
	}

	.muted {
		color: var(--text-muted);
	}

	.change {
		color: var(--warning);
	}

	@media (max-width: 900px) {
		.top-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
