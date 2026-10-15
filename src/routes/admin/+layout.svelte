<!-- src/routes/admin/+layout.svelte -->
<script lang="ts">
	/**
	 * Shared chrome for every /admin page: a way back to the area list plus
	 * navigation between the admin sections. The home page's Header carries
	 * the same links, but it isn't rendered on admin routes.
	 *
	 * Also the admin UI's shared control styles (.btn, .input, .field,
	 * .data-table, .segmented, .badge, …). They're :global so pages and
	 * feature components can use the class names, but scoped under
	 * .admin-shell so they can never reach the main app's own styles. Page
	 * frame and cards are components: $lib/components/admin/AdminPage and
	 * Panel.
	 */
	import { page } from '$app/state';

	let { children } = $props();

	const sections = [
		{ href: '/admin/dashboard', label: 'Dashboard' },
		{ href: '/admin/tiers', label: 'Tiers' },
		{ href: '/admin/autoscale', label: 'Autoscale' },
		{ href: '/admin/requests', label: 'Requests' },
		{ href: '/admin/spawnpoints', label: 'Spawnpoints' },
		{ href: '/admin/tileserver', label: 'Tileserver' }
	];
</script>

<div class="admin-bar">
	<a class="back" href="/">← Back to areas</a>
	<nav aria-label="Admin sections">
		{#each sections as s (s.href)}
			<a href={s.href} aria-current={page.url.pathname.startsWith(s.href) ? 'page' : undefined}
				>{s.label}</a
			>
		{/each}
	</nav>
</div>

<div class="admin-shell">
	{@render children()}
</div>

<style>
	.admin-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem 1.5rem;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid #1a2540;
		background: #0a1020;
	}

	.back {
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
	}

	nav a {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-muted);
		text-decoration: none;
		padding: 0.55rem 0;
		border-bottom: 2px solid transparent;
	}

	nav a:hover {
		color: var(--text);
	}

	nav a[aria-current='page'] {
		color: var(--text);
		border-bottom-color: #38bdf8;
	}

	/* ── Shared admin controls ─────────────────────────────────── */

	.admin-shell :global(.hint) {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.admin-shell :global(.empty) {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.admin-shell :global(.card-label) {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	/* Buttons */
	.admin-shell :global(.btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 38px;
		padding: 0.5rem 0.95rem;
		border-radius: 8px;
		border: 1px solid #24325a;
		background: #1a2540;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
	}

	.admin-shell :global(.btn:hover) {
		background: #22305a;
	}

	.admin-shell :global(.btn:disabled) {
		opacity: 0.5;
		cursor: default;
	}

	.admin-shell :global(.btn-primary) {
		background: #38bdf8;
		border-color: #38bdf8;
		color: #04111f;
	}

	.admin-shell :global(.btn-primary:hover) {
		background: #7dd3fc;
	}

	.admin-shell :global(.btn-success) {
		background: rgba(52, 211, 153, 0.12);
		border-color: rgba(52, 211, 153, 0.45);
		color: var(--success);
	}

	.admin-shell :global(.btn-success:hover) {
		background: rgba(52, 211, 153, 0.2);
	}

	.admin-shell :global(.btn-danger) {
		background: rgba(248, 113, 113, 0.1);
		border-color: rgba(248, 113, 113, 0.45);
		color: var(--danger-soft);
	}

	.admin-shell :global(.btn-danger:hover) {
		background: rgba(248, 113, 113, 0.18);
	}

	.admin-shell :global(.btn-sm) {
		min-height: 32px;
		padding: 0.3rem 0.7rem;
		font-size: var(--text-sm);
	}

	/* Form fields: <label class="field"><span class="field-label">…</span><input class="input"> <span class="hint">…</span></label> */
	.admin-shell :global(.field) {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.admin-shell :global(.field-label) {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text);
	}

	.admin-shell :global(.input) {
		box-sizing: border-box;
		width: 100%;
		min-height: 38px;
		padding: 0.45rem 0.65rem;
		border-radius: 8px;
		border: 1px solid #1f2b47;
		background: #0a1020;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
	}

	.admin-shell :global(.input:focus) {
		outline: 2px solid #38bdf8;
		outline-offset: -1px;
		border-color: transparent;
	}

	.admin-shell :global(textarea.input) {
		font-family: ui-monospace, monospace;
		font-size: var(--text-sm);
		resize: vertical;
	}

	.admin-shell :global(.check) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		color: var(--text);
		cursor: pointer;
	}

	.admin-shell :global(.check input) {
		width: 1rem;
		height: 1rem;
		accent-color: #38bdf8;
	}

	/* Segmented control: <div class="segmented" role="group"> of <button aria-pressed> or <a aria-current> */
	.admin-shell :global(.segmented) {
		display: inline-flex;
		flex-wrap: wrap;
		background: #0a1020;
		border: 1px solid #1a2540;
		border-radius: 8px;
		padding: 3px;
	}

	.admin-shell :global(.segmented > button),
	.admin-shell :global(.segmented > a) {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 36px;
		padding: 0.45rem 0.8rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}

	.admin-shell :global(.segmented > button:hover),
	.admin-shell :global(.segmented > a:hover) {
		color: var(--text);
	}

	.admin-shell :global(.segmented > [aria-pressed='true']),
	.admin-shell :global(.segmented > [aria-current='page']) {
		background: #1a2540;
		color: var(--text);
	}

	/* Badges */
	.admin-shell :global(.badge) {
		display: inline-flex;
		align-items: center;
		padding: 0.05rem 0.4rem;
		border-radius: 5px;
		border: 1px solid #24325a;
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.03em;
		white-space: nowrap;
	}

	.admin-shell :global(.badge-good) {
		border-color: rgba(52, 211, 153, 0.4);
		background: rgba(52, 211, 153, 0.1);
		color: var(--success);
	}

	.admin-shell :global(.badge-warn) {
		border-color: rgba(251, 191, 36, 0.4);
		background: rgba(251, 191, 36, 0.1);
		color: var(--warning);
	}

	.admin-shell :global(.badge-danger) {
		border-color: rgba(248, 113, 113, 0.4);
		background: rgba(248, 113, 113, 0.1);
		color: var(--danger-soft);
	}

	.admin-shell :global(.badge-accent) {
		border-color: rgba(56, 189, 248, 0.4);
		background: rgba(56, 189, 248, 0.1);
		color: var(--accent-soft);
	}

	.admin-shell :global(.badge-violet) {
		border-color: #3b3566;
		color: var(--violet-soft);
	}

	/* Count pill inside a segmented option */
	.admin-shell :global(.count) {
		min-width: 1.2rem;
		padding: 0 0.35rem;
		border-radius: 999px;
		background: #1f2b47;
		color: var(--text);
		font-size: var(--text-xs);
		text-align: center;
	}

	/* Data tables: wrap in <div class="table-wrap"> for horizontal scroll on phones */
	.admin-shell :global(.table-wrap) {
		overflow-x: auto;
	}

	.admin-shell :global(.data-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.admin-shell :global(.data-table th) {
		text-align: left;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		padding: 0.5rem 0.5rem;
	}

	.admin-shell :global(.data-table td) {
		padding: 0.6rem 0.5rem;
		border-top: 1px solid #141e33;
		vertical-align: middle;
	}

	.admin-shell :global(.data-table .num) {
		text-align: right;
	}
</style>
