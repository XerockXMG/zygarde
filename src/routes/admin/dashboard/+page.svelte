<!-- src/routes/admin/dashboard/+page.svelte -->
<script lang="ts">
	import {
		goalPercent,
		percentOf,
		sortAndLimitRanking,
		type RankingShow,
		type RankingSort
	} from '$lib/features/admin-dashboard/ranking';
	import { areaLink } from '$lib/features/area-management/deepLink';
	import AdminPage from '$lib/components/admin/AdminPage.svelte';
	import Panel from '$lib/components/admin/Panel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const NO_VOTES_PREVIEW = 20;

	let sort = $state<RankingSort>('all');
	let show = $state<RankingShow>(10);
	let showAllNoVotes = $state(false);

	const stats = $derived(data.stats);
	const report = $derived(data.voteReport);

	const rankingRows = $derived(sortAndLimitRanking(data.areaRanking, sort, show));
	const maxTokens = $derived(Math.max(1, ...data.areaRanking.map((r) => r.tokens)));
	const topVoters = $derived(report.topVoters.slice(0, show === 5 ? 5 : 10));
	const noVotes = $derived(
		showAllNoVotes
			? report.enabledAreasWithNoVotes
			: report.enabledAreasWithNoVotes.slice(0, NO_VOTES_PREVIEW)
	);

	const meetingPct = $derived(percentOf(stats.areasMeetingTarget, stats.enabledAreas));
	const belowPct = $derived(percentOf(stats.areasBelowTarget, stats.enabledAreas));
	const unspentTokens = $derived(Math.max(0, stats.tokensAvailable - stats.tokensSpent));

	const rankingHint = $derived(
		`Sorted by ${sort === 'all' ? 'all tokens' : 'subscriber tokens'}. The green share of each bar comes from active subscribers.`
	);

	const sortOptions: { value: RankingSort; label: string }[] = [
		{ value: 'all', label: 'All tokens' },
		{ value: 'subscribers', label: 'Subscriber tokens' }
	];
	const showOptions = $derived<{ value: RankingShow; label: string }[]>([
		{ value: 5, label: 'Top 5' },
		{ value: 10, label: 'Top 10' },
		{ value: 'all', label: `All ${data.areaRanking.length}` }
	]);
</script>

<AdminPage
	title="Dashboard"
	meta="{stats.totalAreas} areas · {stats.enabledAreas} enabled · {report.voterCount} voters"
>
	<section class="cards" aria-label="Summary">
		<Panel>
			<div class="card">
				<h2 class="card-label">Token goals</h2>
				<p class="headline">
					<span class="big good">{stats.areasMeetingTarget}</span>
					<span class="headline-text">of {stats.enabledAreas} enabled areas meeting goal</span>
				</p>
				<div class="split-bar" aria-hidden="true">
					<span class="good-fill" style:width="{meetingPct}%"></span>
					<span class="warn-fill" style:width="{belowPct}%"></span>
				</div>
				<dl class="legend">
					<div>
						<dt><span class="swatch good-fill"></span>Meeting goal</dt>
						<dd>{stats.areasMeetingTarget}</dd>
					</div>
					<div>
						<dt><span class="swatch warn-fill"></span>Below goal</dt>
						<dd>{stats.areasBelowTarget}</dd>
					</div>
					<div class="zero">
						<dt><span class="swatch"></span>Zero tokens</dt>
						<dd>{stats.areasWithZeroTokens}</dd>
					</div>
				</dl>
			</div>
		</Panel>

		<Panel>
			<div class="card">
				<h2 class="card-label">Voting coverage</h2>
				<p class="headline">
					<span class="big accent">{report.areasWithVotes}</span>
					<span class="headline-text">of {stats.totalAreas} areas have votes</span>
				</p>
				<div class="meter" aria-hidden="true">
					<span
						class="accent-fill"
						style:width="{percentOf(report.areasWithVotes, stats.totalAreas)}%"
					></span>
				</div>
				<div class="mini-grid">
					<div class="mini">
						<span class="mini-label">Voters</span>
						<span class="mini-value">{report.voterCount}</span>
					</div>
					<div class="mini">
						<span class="mini-label">Active subscribers</span>
						<span class="mini-value"
							>{report.subscriberVoterCount}
							<small>{percentOf(report.subscriberVoterCount, report.voterCount)}%</small></span
						>
					</div>
				</div>
			</div>
		</Panel>

		<Panel>
			<div class="card">
				<h2 class="card-label">Capacity</h2>
				<div class="capacity-row">
					<div class="capacity-head">
						<span>Tokens spent</span>
						<span><b>{stats.tokensSpent}</b> / {stats.tokensAvailable}</span>
					</div>
					<div class="meter" aria-hidden="true">
						<span
							class="violet-fill"
							style:width="{percentOf(stats.tokensSpent, stats.tokensAvailable)}%"
						></span>
					</div>
					<span class="hint">{unspentTokens} tokens unspent</span>
				</div>
				<div class="capacity-row">
					<div class="capacity-head">
						<span>Pokémon workers</span>
						<span
							><b>{stats.effectiveWorkers.toLocaleString()}</b> / {stats.baselineWorkers.toLocaleString()}</span
						>
					</div>
					<div class="meter" aria-hidden="true">
						<span
							class="violet-fill"
							style:width="{percentOf(stats.effectiveWorkers, stats.baselineWorkers)}%"
						></span>
					</div>
					<span class="hint">
						Running vs. baseline —
						{#if stats.throttledAreas > 0}
							autoscale is throttling {stats.throttledAreas}
							{stats.throttledAreas === 1 ? 'area' : 'areas'}
						{:else}
							autoscale isn't throttling any area
						{/if}
					</span>
				</div>
			</div>
		</Panel>
	</section>

	<div class="body">
		<Panel title="Area ranking" hint={rankingHint}>
			{#snippet actions()}
				<div class="segmented" role="group" aria-label="Sort by">
					{#each sortOptions as o (o.value)}
						<button type="button" aria-pressed={sort === o.value} onclick={() => (sort = o.value)}
							>{o.label}</button
						>
					{/each}
				</div>
				<div class="segmented" role="group" aria-label="Rows to show">
					{#each showOptions as o (o.value)}
						<button type="button" aria-pressed={show === o.value} onclick={() => (show = o.value)}
							>{o.label}</button
						>
					{/each}
				</div>
			{/snippet}

			{#if rankingRows.length === 0}
				<p class="empty">No votes yet.</p>
			{:else}
				<div class="table-wrap">
					<table class="data-table ranking">
						<thead>
							<tr>
								<th scope="col" class="rank">#</th>
								<th scope="col">Area</th>
								<th scope="col" class="col-tokens">Tokens</th>
								<th scope="col" class="col-goal">% of goal</th>
								<th scope="col" class="num">Subscriber share</th>
								<th scope="col" class="num">Voters</th>
								<th scope="col" class="num">Baseline workers</th>
							</tr>
						</thead>
						<tbody>
							{#each rankingRows as r, i (r.id)}
								{@const goal = goalPercent(r.tokens, r.target)}
								{@const share = percentOf(r.subscriberTokens, r.tokens)}
								<tr>
									<td class="rank">{i + 1}</td>
									<td class="area-name">
										{r.name}
										{#if !r.enabled}<span class="badge badge-warn">disabled</span>{/if}
									</td>
									<td>
										<div class="bar-cell">
											<div class="track">
												<div class="token-bar" style:width="{(r.tokens / maxTokens) * 100}%">
													<span class="good-fill" style:width="{share}%"></span>
												</div>
											</div>
											<b class="bar-num">{r.tokens}</b>
										</div>
									</td>
									<td>
										{#if goal === null}
											<span class="hint">No goal</span>
										{:else}
											<div class="bar-cell">
												<div class="track">
													<span
														class={goal >= 100 ? 'good-fill' : 'warn-fill'}
														style:width="{Math.min(goal, 100)}%"
													></span>
												</div>
												<b class="goal-num" class:good={goal >= 100} class:warn={goal < 100}
													>{goal}%</b
												>
											</div>
											<span class="hint">{r.tokens} of {r.target} tokens</span>
										{/if}
									</td>
									<td class="num" class:danger={share === 0} class:warn={share > 0 && share < 50}
										>{share}%</td
									>
									<td class="num">{r.subscriberVoters}<span class="of"> / {r.voters}</span></td>
									<td class="num">{r.baselineWorkers.toLocaleString()}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="table-legend">
					<span><span class="swatch good-fill"></span>Subscriber tokens</span>
					<span><span class="swatch accent-fill"></span>Other tokens</span>
					<span><span class="swatch warn-fill"></span>Below goal</span>
					<span
						>Voters: subscribers / all · Baseline: autoscale max when autoscale is on, else live</span
					>
				</div>
			{/if}
		</Panel>

		<aside class="side">
			<Panel title="Top voters">
				{#snippet actions()}<span class="hint">tokens · areas</span>{/snippet}
				{#if topVoters.length === 0}
					<p class="empty">No votes yet.</p>
				{:else}
					<ol class="voter-list">
						{#each topVoters as v, i (v.discordId)}
							<li>
								<span class="voter">
									<span class="rank">{i + 1}</span>
									<span class="voter-name">{v.username}</span>
									{#if v.tierName}<span class="badge badge-violet">{v.tierName}</span>{/if}
								</span>
								<span class="voter-stats">
									<b class="voter-tokens">{v.tokens}</b>
									<span class="voter-areas">· {v.areas} {v.areas === 1 ? 'area' : 'areas'}</span>
								</span>
							</li>
						{/each}
					</ol>
				{/if}
			</Panel>

			<Panel title="Enabled, no votes">
				{#snippet actions()}<span class="no-vote-count"
						>{report.enabledAreasWithNoVotes.length}</span
					>{/snippet}
				{#if report.enabledAreasWithNoVotes.length === 0}
					<p class="empty">Every enabled area has at least one vote.</p>
				{:else}
					<ul class="novote-list">
						{#each noVotes as a (a.id)}
							<li><a href={areaLink(a.id)} title="Show {a.name} on the map">{a.name}</a></li>
						{/each}
					</ul>
					{#if report.enabledAreasWithNoVotes.length > NO_VOTES_PREVIEW}
						<button
							type="button"
							class="link-button"
							onclick={() => (showAllNoVotes = !showAllNoVotes)}
						>
							{showAllNoVotes
								? 'Show fewer'
								: `Show all ${report.enabledAreasWithNoVotes.length} →`}
						</button>
					{/if}
				{/if}
			</Panel>
		</aside>
	</div>
</AdminPage>

<style>
	/* Page frame, panels, segmented controls, badges and table basics come from
	   AdminPage / Panel and the admin layout's shared styles. */
	.card p,
	.card h2 {
		margin: 0;
	}

	.no-vote-count {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--warning);
	}

	/* ── Summary cards ─────────────────────────────────────────── */

	.cards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.25rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.headline {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.big {
		font-size: var(--text-display);
		font-weight: 750;
		line-height: 1;
	}

	.headline-text {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.good {
		color: var(--success);
	}

	.warn {
		color: var(--warning);
	}

	.danger {
		color: var(--danger);
	}

	.accent {
		color: var(--accent);
	}

	.good-fill {
		background: #34d399;
	}

	.warn-fill {
		background: #fbbf24;
	}

	.accent-fill {
		background: #38bdf8;
	}

	.violet-fill {
		background: #a78bfa;
	}

	.split-bar {
		display: flex;
		gap: 2px;
		height: 10px;
		border-radius: 5px;
		overflow: hidden;
		background: #1a2540;
	}

	.meter {
		height: 10px;
		border-radius: 5px;
		overflow: hidden;
		background: #1a2540;
	}

	.split-bar span,
	.meter span {
		display: block;
		height: 100%;
	}

	.legend {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: var(--text-sm);
	}

	.legend div {
		display: flex;
		justify-content: space-between;
	}

	.legend dt {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.legend dd {
		margin: 0;
		font-weight: 700;
	}

	.legend .zero {
		color: var(--danger-soft);
	}

	.swatch {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 2px;
	}

	.mini-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.mini {
		background: #0a1020;
		border: 1px solid #16203a;
		border-radius: 8px;
		padding: 0.75rem 0.85rem;
		display: flex;
		flex-direction: column;
	}

	.mini-label {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.mini-value {
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.mini-value small {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}

	.capacity-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.capacity-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.capacity-head b {
		font-size: var(--text-xl);
		color: var(--violet-soft);
	}

	/* ── Ranking table + side column ──────────────────────────── */

	.body {
		display: grid;
		grid-template-columns: minmax(0, 2.2fr) minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	.ranking {
		min-width: 720px;
	}

	.rank {
		width: 1.75rem;
		color: var(--text-muted);
	}

	.col-tokens {
		width: 30%;
	}

	.col-goal {
		width: 20%;
	}

	.area-name {
		font-weight: 600;
	}

	.bar-cell {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.track {
		flex-grow: 1;
		height: 8px;
		border-radius: 4px;
		background: #131c30;
		overflow: hidden;
	}

	.track > span {
		display: block;
		height: 8px;
		border-radius: 4px;
	}

	.token-bar {
		display: flex;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		background: #38bdf8;
	}

	.token-bar span {
		display: block;
		height: 8px;
	}

	.bar-num {
		width: 1.75rem;
		text-align: right;
	}

	.goal-num {
		width: 2.9rem;
		text-align: right;
	}

	td .hint {
		display: block;
		margin-top: 0.15rem;
		font-size: var(--text-xs);
	}

	.of {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.table-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		margin-top: 0.9rem;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.table-legend > span {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-width: 0;
	}

	.voter-list,
	.novote-list {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--text-sm);
	}

	.voter-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-top: 1px solid #141e33;
	}

	.voter {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}

	.voter .rank {
		width: 1.1rem;
		text-align: right;
		flex-shrink: 0;
	}

	.voter-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.novote-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: 1rem;
	}

	.novote-list li {
		border-top: 1px solid #141e33;
		min-width: 0;
	}

	.novote-list a {
		display: block;
		padding: 0.3rem 0;
		color: var(--text);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.novote-list a:hover {
		color: var(--accent-soft);
		text-decoration: underline;
	}

	/* Fixed-width columns so token counts line up whether the label reads
	   "1 area" or "2 areas". */
	.voter-stats {
		display: flex;
		align-items: baseline;
		flex-shrink: 0;
	}

	.voter-tokens {
		min-width: 1.75rem;
		text-align: right;
	}

	.voter-areas {
		width: 4.75rem;
		padding-left: 0.3rem;
		color: var(--text-muted);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.link-button {
		margin-top: 0.6rem;
		padding: 0.4rem 0;
		border: none;
		background: none;
		color: var(--accent-soft);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.link-button:hover {
		color: var(--accent-soft);
	}

	@media (max-width: 1100px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.body {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 700px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
