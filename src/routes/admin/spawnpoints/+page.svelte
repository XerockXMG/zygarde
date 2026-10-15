<!-- src/routes/admin/spawnpoints/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AdminPage from '$lib/components/admin/AdminPage.svelte';
	import Panel from '$lib/components/admin/Panel.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const banner = $derived(
		form?.message
			? { kind: 'error' as const, text: form.message }
			: form?.success
				? { kind: 'success' as const, text: 'Changes saved.' }
				: null
	);

	const modes = $derived(
		Object.entries(data.cacheStats.byMode).sort(([a], [b]) => a.localeCompare(b))
	);
</script>

<AdminPage
	title="Spawnpoints"
	meta="Spawnpoint counts come from Golbat's database and are cached locally, since Golbat can be slow to query."
	{banner}
>
	<div class="cards">
		<Panel>
			<div class="card">
				<h2 class="card-label">Golbat connection</h2>
				{#if data.golbatStatus.connected}
					<p class="status good"><span class="dot" aria-hidden="true"></span>Connected</p>
					<p class="hint">Counts load live and are cached for {data.settings.cacheTtlHours} h.</p>
				{:else}
					<p class="status bad"><span class="dot" aria-hidden="true"></span>Not connected</p>
					<p class="reason">{data.golbatStatus.reason ?? 'Unknown error'}</p>
					<p class="hint">Set GOLBAT_DATABASE_URL to enable spawnpoint counts.</p>
				{/if}
			</div>
		</Panel>

		<Panel>
			<div class="card">
				<h2 class="card-label">Cache</h2>
				<p class="headline">
					<span class="big">{data.cacheStats.totalEntries.toLocaleString()}</span>
					<span class="hint">cached {data.cacheStats.totalEntries === 1 ? 'entry' : 'entries'}</span
					>
				</p>
				{#if modes.length > 0}
					<dl class="modes">
						{#each modes as [mode, n] (mode)}
							<div>
								<dt>{mode}</dt>
								<dd>{n.toLocaleString()}</dd>
							</div>
						{/each}
					</dl>
				{/if}
				<form method="POST" action="?/clearCache" use:enhance class="card-foot">
					<button type="submit" class="btn btn-danger" disabled={data.cacheStats.totalEntries === 0}
						>Clear cache</button
					>
					<span class="hint">Counts re-fetch from Golbat the next time they're viewed.</span>
				</form>
			</div>
		</Panel>

		<Panel>
			<form
				method="POST"
				action="?/saveSettings"
				class="card"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
			>
				<h2 class="card-label">Settings</h2>
				<label class="field">
					<span class="field-label">Recent window (days)</span>
					<input
						class="input"
						type="number"
						name="recentDays"
						min="1"
						max="365"
						value={data.settings.recentDays}
					/>
					<span class="hint">"Recent" counts include spawnpoints seen within this many days.</span>
				</label>
				<label class="field">
					<span class="field-label">Cache TTL (hours)</span>
					<input
						class="input"
						type="number"
						name="cacheTtlHours"
						min="1"
						max="168"
						value={data.settings.cacheTtlHours}
					/>
					<span class="hint">How long a cached count is reused before re-querying Golbat.</span>
				</label>
				<div class="card-foot">
					<button type="submit" class="btn btn-primary">Save settings</button>
				</div>
			</form>
		</Panel>
	</div>
</AdminPage>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.25rem;
		align-items: stretch;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		height: 100%;
	}

	.card p {
		margin: 0;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: currentColor;
	}

	.status.good {
		color: var(--success);
	}

	.status.bad {
		color: var(--danger);
	}

	.reason {
		font-family: ui-monospace, monospace;
		font-size: var(--text-sm);
		color: var(--danger-soft);
		background: #0a1020;
		border: 1px solid #1f2b47;
		border-radius: 8px;
		padding: 0.5rem 0.65rem;
		overflow-wrap: anywhere;
	}

	.headline {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}

	.big {
		font-size: var(--text-display);
		font-weight: 750;
		line-height: 1;
		color: var(--accent);
	}

	.modes {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: var(--text-sm);
	}

	.modes div {
		display: flex;
		justify-content: space-between;
		border-top: 1px solid #141e33;
		padding-top: 0.4rem;
	}

	.modes dt {
		text-transform: capitalize;
		color: var(--text);
	}

	.modes dd {
		margin: 0;
		font-weight: 700;
	}

	.field .input {
		max-width: 10rem;
	}

	.card-foot {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	@media (max-width: 1100px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
