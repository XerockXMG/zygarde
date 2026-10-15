<script lang="ts">
	import { voteState } from '../stores/voteState.svelte';

	let {
		areaId,
		loggedIn
	}: {
		areaId: number;
		loggedIn: boolean;
	} = $props();

	const mine = $derived(voteState.allocations[areaId] ?? 0);
	const isPrimary = $derived(voteState.primaryAreaId === areaId);
	const canAdd = $derived(voteState.remainingBudget > 0);

	function increment(): void {
		voteState.setAllocation(areaId, mine + 1);
	}

	function decrement(): void {
		voteState.setAllocation(areaId, Math.max(0, mine - 1));
	}
</script>

{#if loggedIn}
	<div class="vote-stepper">
		<button
			type="button"
			class="primary-btn"
			class:active={isPrimary}
			title={isPrimary ? 'Clear primary area' : 'Mark as primary'}
			onclick={() => (isPrimary ? voteState.clearPrimary() : voteState.setPrimary(areaId))}
			>♥</button
		>
		<button
			type="button"
			class="step-btn"
			disabled={mine === 0}
			title="Remove a token"
			onclick={decrement}>−</button
		>
		<span class="token-count" title="Your tokens on this area">{mine}</span>
		<button
			type="button"
			class="step-btn"
			disabled={!canAdd}
			title={canAdd ? 'Add a token' : 'No tokens left in your budget'}
			onclick={increment}>+</button
		>
	</div>
{/if}

<style>
	.vote-stepper {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}

	.primary-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		padding: 0 0.15rem;
	}

	.primary-btn.active {
		color: var(--rose);
	}

	.step-btn {
		background: #162040;
		border: 1px solid #1a2540;
		border-radius: 4px;
		color: var(--text-secondary);
		font-size: var(--text-xs);
		line-height: 1;
		width: 1.1rem;
		height: 1.1rem;
		cursor: pointer;
	}

	.step-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.token-count {
		font-size: var(--text-xs);
		color: var(--token);
		min-width: 1rem;
		text-align: center;
		white-space: nowrap;
	}
</style>
