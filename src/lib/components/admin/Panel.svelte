<!-- src/lib/components/admin/Panel.svelte -->
<script lang="ts">
	/**
	 * The standard admin card: dark panel with an optional title, hint line
	 * and right-aligned header actions (segmented controls, buttons, counts).
	 */
	import type { Snippet } from 'svelte';

	let {
		title,
		hint,
		actions,
		children
	}: {
		title?: string;
		hint?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();

	const headingId = $props.id();
</script>

<section class="panel" aria-labelledby={title ? headingId : undefined}>
	{#if title || actions}
		<div class="panel-head">
			{#if title}
				<div>
					<h2 id={headingId}>{title}</h2>
					{#if hint}<p class="panel-hint">{hint}</p>{/if}
				</div>
			{/if}
			{#if actions}<div class="panel-actions">{@render actions()}</div>{/if}
		</div>
	{/if}
	{@render children()}
</section>

<style>
	.panel {
		box-sizing: border-box;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 12px;
		padding: 1.25rem 1.4rem;
		min-width: 0;
	}

	.panel-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem 1rem;
		margin-bottom: 0.9rem;
	}

	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 700;
	}

	.panel-hint {
		margin: 0.2rem 0 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
</style>
