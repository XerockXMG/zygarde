<!-- src/lib/components/admin/AdminPage.svelte -->
<script lang="ts">
	/**
	 * Page frame shared by every /admin page: title, a one-line meta summary,
	 * optional header actions, and the success/error banner a form action
	 * returns. The nav bar and back link come from routes/admin/+layout.svelte;
	 * shared control styles (.btn, .input, .data-table, …) live there too.
	 */
	import type { Snippet } from 'svelte';

	let {
		title,
		meta,
		banner = null,
		actions,
		children
	}: {
		title: string;
		meta?: string;
		/** A form action's outcome to show at the top of the page. */
		banner?: { kind: 'success' | 'error'; text: string } | null;
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<main>
	<header class="page-head">
		<div>
			<h1>{title}</h1>
			{#if meta}<p class="meta">{meta}</p>{/if}
		</div>
		{#if actions}<div class="page-actions">{@render actions()}</div>{/if}
	</header>

	{#if banner}
		<p class="banner {banner.kind}" role={banner.kind === 'error' ? 'alert' : 'status'}>
			{banner.text}
		</p>
	{/if}

	{@render children()}
</main>

<style>
	main {
		box-sizing: border-box;
		width: 100%;
		padding: 1.5rem 2rem 3rem;
		color: var(--text);
		font-variant-numeric: tabular-nums;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.page-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: 0.75rem 1.5rem;
	}

	h1 {
		margin: 0;
		font-size: var(--text-2xl);
		font-weight: 750;
	}

	.meta {
		margin: 0.2rem 0 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.page-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.banner {
		margin: 0;
		border-radius: 10px;
		padding: 0.7rem 1rem;
		font-size: var(--text-sm);
	}

	.banner.error {
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: var(--danger-soft);
	}

	.banner.success {
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.35);
		color: var(--success);
	}

	@media (max-width: 700px) {
		main {
			padding: 1rem 1rem 2rem;
		}
	}
</style>
