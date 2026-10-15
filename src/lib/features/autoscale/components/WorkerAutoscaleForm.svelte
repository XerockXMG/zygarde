<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Area } from '$lib/features/area-management/types';
	import { voteState } from '$lib/features/voting/stores/voteState.svelte';
	import { resolveSpeedTier, computeScaledWorkers } from '../tiers';
	import type { AutoscaleConfig } from '../types';

	let {
		area,
		autoscaleConfig,
		hasTarget
	}: { area: Area; autoscaleConfig: AutoscaleConfig | undefined; hasTarget: boolean } = $props();

	const enabled = $derived(autoscaleConfig?.enabled ?? false);
	const maxWorkers = $derived(autoscaleConfig?.maxPokemonWorkers ?? area.pokemon_mode.workers);

	// Live preview of what the next sync tick would apply — read from the
	// same voteState the rest of the card uses, so it always matches what's
	// on screen elsewhere (the ⚖ token/target badge above).
	const target = $derived(voteState.targets[area.id] ?? null);
	const tokenTotal = $derived(voteState.tokenTotals[area.id] ?? 0);
	const fundedPct = $derived(target && target > 0 ? (tokenTotal / target) * 100 : null);
	const tier = $derived(fundedPct !== null ? resolveSpeedTier(fundedPct) : null);
	const scaledWorkers = $derived(tier !== null ? computeScaledWorkers(maxWorkers, tier) : null);
</script>

<div class="autoscale-box">
	<div class="autoscale-header">
		<span class="autoscale-label">Worker Autoscale</span>
		<span class="autoscale-status" class:on={enabled}>{enabled ? 'ON' : 'OFF'}</span>
	</div>

	{#if enabled}
		<p class="autoscale-hint">
			Max {maxWorkers} workers
			{#if tier !== null}
				· currently {tier}% speed → {scaledWorkers} workers
			{/if}
		</p>
		<form method="POST" action="?/disableAutoscale" use:enhance>
			<input type="hidden" name="areaId" value={area.id} />
			<button type="submit" class="btn-disable">Disable (restore to {maxWorkers})</button>
		</form>
	{:else}
		<p class="autoscale-hint">
			{hasTarget
				? `Enabling will lock in the current ${area.pokemon_mode.workers} Pokemon workers as the max.`
				: 'Set a token target below before enabling autoscale.'}
		</p>
		<form method="POST" action="?/enableAutoscale" use:enhance>
			<input type="hidden" name="areaId" value={area.id} />
			<button type="submit" class="btn-enable" disabled={!hasTarget}>Enable Autoscale</button>
		</form>
	{/if}
</div>

<style>
	.autoscale-box {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.6rem;
		border-top: 1px solid #1a2540;
	}

	.autoscale-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.autoscale-label {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.autoscale-status {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		background: rgba(71, 85, 105, 0.2);
		color: var(--text-muted);
	}

	.autoscale-status.on {
		background: rgba(16, 185, 129, 0.15);
		color: var(--success);
	}

	.autoscale-hint {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 0;
	}

	.btn-enable,
	.btn-disable {
		align-self: flex-start;
		border-radius: 6px;
		padding: 0.35rem 0.7rem;
		font-size: var(--text-xs);
		font-weight: 700;
		cursor: pointer;
	}

	.btn-enable {
		background: rgba(16, 185, 129, 0.12);
		border: 1px solid rgba(16, 185, 129, 0.4);
		color: var(--success);
	}

	.btn-enable:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-disable {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.35);
		color: var(--danger);
	}
</style>
