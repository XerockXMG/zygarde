<script lang="ts">
	/**
	 * App-wide top bar: site identity, admin nav, and account state.
	 * Real components throughout (button, chip, pills) rather than bare
	 * inline text/links — the plain-text version this replaces predates
	 * any of this app's other UI having a considered look.
	 */
	import type { SessionUser } from '$lib/features/auth/types';
	import type { Area } from '$lib/features/area-management/types';
	import { voteState } from '$lib/features/voting/stores/voteState.svelte';
	import { mapState } from '$lib/features/map/stores/mapState.svelte';

	let {
		user,
		siteName,
		areas = []
	}: { user: SessionUser | null; siteName: string; areas?: Area[] } = $props();

	const avatarUrl = $derived(
		user?.avatar
			? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=64`
			: 'https://cdn.discordapp.com/embed/avatars/0.png'
	);

	const remainingTokens = $derived(voteState.remainingBudget);
	const totalTokens = $derived(voteState.budget);

	/** Areas the viewer has tokens on, most tokens first (primary first on ties). */
	const myAreas = $derived(
		areas
			.filter((a) => (voteState.allocations[a.id] ?? 0) > 0)
			.map((a) => ({
				area: a,
				amount: voteState.allocations[a.id],
				primary: voteState.primaryAreaId === a.id
			}))
			.sort(
				(a, b) =>
					b.amount - a.amount ||
					Number(b.primary) - Number(a.primary) ||
					a.area.name.localeCompare(b.area.name)
			)
	);

	let menuOpen = $state(false);
	let tokenMenuEl = $state<HTMLDivElement>();

	function pick(area: Area) {
		menuOpen = false;
		mapState.selectArea(area);
	}

	function onWindowClick(e: MouseEvent) {
		if (menuOpen && tokenMenuEl && !tokenMenuEl.contains(e.target as Node)) menuOpen = false;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (menuOpen && e.key === 'Escape') menuOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<header class="app-header">
	<a class="brand" href="/">
		<span class="brand-mark" aria-hidden="true">
			<svg viewBox="0 0 20 20" width="18" height="18">
				<circle
					class="brand-ping"
					cx="10"
					cy="10"
					r="3"
					fill="none"
					stroke="#38bdf8"
					stroke-width="1.5"
				/>
				<circle cx="10" cy="10" r="3" fill="#38bdf8" />
			</svg>
		</span>
		<span class="brand-name">{siteName}</span>
	</a>

	{#if user}
		{#if user.isAdmin}
			<nav class="admin-nav" aria-label="Admin">
				<a href="/admin/dashboard">Dashboard</a>
				<a href="/admin/tiers">Tiers</a>
				<a href="/admin/autoscale">Autoscale</a>
				<a href="/admin/requests">Requests</a>
				<a href="/admin/spawnpoints">Spawnpoints</a>
				<a href="/admin/tileserver">Tileserver</a>
			</nav>
		{/if}

		<div class="token-menu" bind:this={tokenMenuEl}>
			<button
				type="button"
				class="token-budget"
				class:empty={remainingTokens === 0}
				class:open={menuOpen}
				title="Tokens you have left to allocate. Click to see where your tokens are."
				aria-haspopup="true"
				aria-expanded={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span class="token-icon" aria-hidden="true">🪙</span>
				<span class="token-count"
					>{remainingTokens}<span class="token-total">/{totalTokens}</span></span
				>
			</button>

			{#if menuOpen}
				<div class="token-popover" role="menu" aria-label="Your tokens">
					<div class="popover-title">Your tokens</div>
					{#if myAreas.length === 0}
						<p class="popover-empty">You haven't put tokens on any areas yet.</p>
					{:else}
						<ul>
							{#each myAreas as row (row.area.id)}
								<li>
									<button type="button" role="menuitem" onclick={() => pick(row.area)}>
										<span class="row-name">
											{#if row.primary}<span class="row-heart" title="Primary area">♥</span>{/if}
											{row.area.name}
										</span>
										<span class="row-amount">🪙 {row.amount}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="popover-footer">{remainingTokens} unallocated</div>
				</div>
			{/if}
		</div>

		<div class="account">
			<img class="avatar" src={avatarUrl} alt="" />
			<span class="username">{user.username}</span>
			{#if user.isAdmin}<span class="badge">Admin</span>{/if}
			<form method="POST" action="/auth/logout">
				<button type="submit" class="logout" title="Log out" aria-label="Log out">
					<svg
						viewBox="0 0 16 16"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6"
							stroke-linecap="round"
						/>
						<path d="M10.5 11 14 8l-3.5-3M14 8H6" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</form>
		</div>
	{:else}
		<a class="login" href="/auth/discord">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
				<path
					d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.075.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.075-.037A19.74 19.74 0 0 0 3.68 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.128c-.598.35-1.22.645-1.873.892a.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z"
				/>
			</svg>
			Log in with Discord
		</a>
	{/if}
</header>

<style>
	.app-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
		color: inherit;
	}

	.brand-mark {
		display: inline-flex;
		position: relative;
	}

	.brand-ping {
		position: absolute;
		inset: 0;
		transform-origin: center;
		animation: brand-pulse 2.4s ease-out infinite;
	}

	@keyframes brand-pulse {
		0% {
			transform: scale(1);
			opacity: 0.9;
		}
		100% {
			transform: scale(2.2);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.brand-ping {
			animation: none;
			opacity: 0;
		}
	}

	.brand-name {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: var(--text-md);
		letter-spacing: -0.01em;
		color: var(--text);
	}

	.admin-nav {
		display: flex;
		gap: 0.4rem;
		margin-right: auto;
	}

	.admin-nav a {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
		text-decoration: none;
		padding: 0.35rem 0.7rem;
		border-radius: 6px;
		border: 1px solid #1a2540;
		transition:
			color 0.15s,
			border-color 0.15s,
			background 0.15s;
	}

	.admin-nav a:hover {
		color: var(--text);
		border-color: #334155;
		background: #0d1425;
	}

	.token-menu {
		position: relative;
		margin-left: auto;
	}

	.token-budget {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.35);
		border-radius: 8px;
		padding: 0.3rem 0.6rem;
		font: inherit;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.token-budget:hover,
	.token-budget.open {
		background: rgba(245, 158, 11, 0.18);
		border-color: rgba(245, 158, 11, 0.6);
	}

	.token-budget.empty {
		background: rgba(148, 163, 184, 0.08);
		border-color: #1a2540;
	}

	.token-budget.empty:hover,
	.token-budget.empty.open {
		border-color: #334155;
	}

	.token-popover {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 1100;
		width: 280px;
		max-width: calc(100vw - 2rem);
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 10px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
		padding: 0.5rem;
	}

	.popover-title {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-secondary);
		padding: 0.25rem 0.5rem 0.4rem;
	}

	.token-popover ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 50vh;
		overflow-y: auto;
	}

	.token-popover li button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		background: transparent;
		border: none;
		border-radius: 6px;
		padding: 0.45rem 0.5rem;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}

	.token-popover li button:hover,
	.token-popover li button:focus-visible {
		background: #162040;
	}

	.row-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-heart {
		color: var(--rose);
		margin-right: 0.3rem;
	}

	.row-amount {
		flex-shrink: 0;
		font-weight: 700;
		color: var(--token);
	}

	.popover-empty {
		margin: 0;
		padding: 0.25rem 0.5rem 0.5rem;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.popover-footer {
		margin-top: 0.35rem;
		padding: 0.45rem 0.5rem 0.2rem;
		border-top: 1px solid #1a2540;
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.token-icon {
		font-size: var(--text-sm);
		line-height: 1;
	}

	.token-count {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--token);
	}

	.token-budget.empty .token-count {
		color: var(--text-muted);
	}

	.token-total {
		font-weight: 500;
		opacity: 0.7;
	}

	.account {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 8px;
		padding: 0.3rem 0.5rem 0.3rem 0.35rem;
	}

	.avatar {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.username {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text);
	}

	.badge {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		background: rgba(56, 189, 248, 0.15);
		border: 1px solid rgba(56, 189, 248, 0.35);
		color: var(--accent);
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}

	.logout {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 5px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color 0.15s,
			background 0.15s;
	}

	.logout:hover {
		color: var(--danger);
		background: rgba(239, 68, 68, 0.1);
	}

	.login {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
		font-size: var(--text-sm);
		font-weight: 600;
		color: #fff;
		text-decoration: none;
		background: #5865f2;
		padding: 0.45rem 0.9rem;
		border-radius: 8px;
		transition: background 0.15s;
	}

	.login:hover {
		background: #4752c4;
	}

	@media (max-width: 640px) {
		.admin-nav {
			margin-right: 0;
			order: 3;
			width: 100%;
		}

		.token-menu {
			margin-left: 0;
		}
	}
</style>
