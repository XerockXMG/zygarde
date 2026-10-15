<!-- src/routes/admin/tiers/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AdminPage from '$lib/components/admin/AdminPage.svelte';
	import Panel from '$lib/components/admin/Panel.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let search = $state('');
	/** 'all', 'override', or a tier name. */
	let filter = $state('all');

	const overrideCount = $derived(data.users.filter((u) => u.source === 'override').length);
	const tierCounts = $derived(
		data.tiers.map((t) => ({
			...t,
			count: data.users.filter((u) => u.tierName === t.name).length
		}))
	);

	const visibleUsers = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return data.users.filter(
			(u) =>
				(filter === 'all' ||
					(filter === 'override' ? u.source === 'override' : u.tierName === filter)) &&
				(!q || u.username.toLowerCase().includes(q) || u.discordId.includes(q))
		);
	});

	const banner = $derived.by(() => {
		if (form?.message) return { kind: 'error' as const, text: form.message };
		if (form?.success) return { kind: 'success' as const, text: 'Changes saved.' };
		return null;
	});

	const tierSummary = $derived(data.tiers.map((t) => `${t.name} (${t.weight})`).join(', '));
</script>

<AdminPage
	title="Voting tiers"
	meta="{data.users.length} users · {overrideCount} {overrideCount === 1
		? 'override'
		: 'overrides'} · tiers: {tierSummary || 'none configured'}"
	{banner}
>
	<Panel title="Settings" hint="Apply to every area and user; take effect immediately.">
		<form
			method="POST"
			action="?/saveVotingSettings"
			class="settings-form"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			<div class="fields">
				<label class="field">
					<span class="field-label">Workers per token</span>
					<input
						class="input"
						type="number"
						name="workersPerToken"
						min="1"
						max="1000"
						value={data.votingSettings.workersPerToken}
					/>
					<span class="hint"
						>Global default for "Based on Pokémon workers" targets — e.g. 10 means 1 token funds 10
						workers. Per-area overrides win.</span
					>
				</label>
				<label class="field">
					<span class="field-label">Subscription grace period (days)</span>
					<input
						class="input"
						type="number"
						name="subscriptionGracePeriodDays"
						min="1"
						max="90"
						value={data.votingSettings.subscriptionGracePeriodDays}
					/>
					<span class="hint"
						>How long a user can fail the Discord-role check before being downgraded and having
						their tokens trimmed to fit.</span
					>
				</label>
			</div>
			<div>
				<button type="submit" class="btn btn-primary">Save settings</button>
			</div>
		</form>
	</Panel>

	<Panel
		title="Users"
		hint="Tiers come from Discord roles unless an admin override is set. Changing a tier trims the user's tokens to fit their new budget."
	>
		{#snippet actions()}
			<input
				class="input search"
				type="search"
				placeholder="Search name or Discord ID"
				aria-label="Search users"
				bind:value={search}
			/>
		{/snippet}

		<div class="segmented filter" role="group" aria-label="Filter users">
			<button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}
				>All <span class="count">{data.users.length}</span></button
			>
			{#each tierCounts as t (t.name)}
				<button type="button" aria-pressed={filter === t.name} onclick={() => (filter = t.name)}
					>{t.name} <span class="count">{t.count}</span></button
				>
			{/each}
			<button
				type="button"
				aria-pressed={filter === 'override'}
				onclick={() => (filter = 'override')}
				>Overrides <span class="count">{overrideCount}</span></button
			>
		</div>

		{#if visibleUsers.length === 0}
			<p class="empty">
				{data.users.length === 0 ? 'No users have logged in yet.' : 'No users match.'}
			</p>
		{:else}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th scope="col">User</th>
							<th scope="col">Tier</th>
							<th scope="col" class="num">Tokens</th>
							<th scope="col">Source</th>
							<th scope="col">Set tier</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleUsers as user (user.discordId)}
							<tr>
								<td>
									<span class="username">{user.username}</span>
									<span class="discord-id">{user.discordId}</span>
								</td>
								<td><span class="badge badge-violet">{user.tierName}</span></td>
								<td class="num">{user.weight}</td>
								<td>
									{#if user.source === 'override'}
										<span class="badge badge-warn">Override</span>
									{:else}
										<span class="badge">Discord role</span>
									{/if}
								</td>
								<td>
									<div class="row-actions">
										<form method="POST" action="?/setOverride" use:enhance class="set-form">
											<input type="hidden" name="discordId" value={user.discordId} />
											<select class="input" name="tierName" aria-label="Tier for {user.username}">
												{#each data.tiers as tier (tier.name)}
													<option value={tier.name} selected={tier.name === user.tierName}>
														{tier.name} ({tier.weight})
													</option>
												{/each}
											</select>
											<button type="submit" class="btn btn-sm">Set</button>
										</form>
										{#if user.source === 'override'}
											<form method="POST" action="?/clearOverride" use:enhance>
												<input type="hidden" name="discordId" value={user.discordId} />
												<button
													type="submit"
													class="btn btn-sm btn-danger"
													title="Go back to role-based tier">Clear override</button
												>
											</form>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if visibleUsers.length !== data.users.length}
				<p class="hint shown">Showing {visibleUsers.length} of {data.users.length}</p>
			{/if}
		{/if}
	</Panel>
</AdminPage>

<style>
	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.25rem;
	}

	.fields .input {
		max-width: 10rem;
	}

	.search {
		width: 16rem;
	}

	.filter {
		margin-bottom: 0.75rem;
	}

	.username {
		font-weight: 600;
	}

	.discord-id {
		display: block;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.set-form {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.set-form .input {
		width: auto;
		min-height: 32px;
		padding: 0.25rem 0.5rem;
	}

	.shown {
		margin: 0.75rem 0 0;
	}

	@media (max-width: 1100px) {
		.fields {
			grid-template-columns: minmax(0, 1fr);
		}

		.search {
			width: 100%;
		}
	}
</style>
