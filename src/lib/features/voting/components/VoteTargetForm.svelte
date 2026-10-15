<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Area } from '$lib/features/area-management/types';
	import type { TargetConfig } from '../server/targets';

	let {
		area,
		targetConfig,
		maxPokemonWorkers
	}: { area: Area; targetConfig: TargetConfig | undefined; maxPokemonWorkers: number } = $props();

	// Not initialized from targetConfig directly (that would only capture its
	// first value) — the effect below sets it on mount and keeps it in sync
	// if targetConfig reloads with a different value (e.g. after saving, or
	// another admin's change coming through invalidateAll).
	let mode = $state<'static' | 'workers'>('static');
	let overrideValue = $state('');
	$effect(() => {
		mode = targetConfig?.mode ?? 'static';
		overrideValue = targetConfig?.workersPerTokenOverride?.toString() ?? '';
	});
</script>

<form
	method="POST"
	action="?/setAreaTarget"
	use:enhance={() => {
		return ({ update }) => update({ reset: false });
	}}
>
	<input type="hidden" name="areaId" value={area.id} />

	<label>
		Token target
		<select name="mode" bind:value={mode}>
			<option value="static">Static number</option>
			<option value="workers">Based on Pokemon workers</option>
		</select>
	</label>

	{#if mode === 'static'}
		<label>
			Value
			<input type="number" name="staticValue" min="0" value={targetConfig?.staticValue ?? 0} />
		</label>
	{:else}
		<span class="workers-hint">= {maxPokemonWorkers} workers</span>
		<input type="hidden" name="staticValue" value={targetConfig?.staticValue ?? 0} />
		<label>
			Workers/token override
			<input
				type="number"
				name="workersPerTokenOverride"
				min="1"
				placeholder="global default"
				bind:value={overrideValue}
			/>
		</label>
		<span class="workers-hint">e.g. 10 = 1 token funds 10 workers</span>
	{/if}

	<button type="submit">Save</button>
</form>

<style>
	form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.6rem;
		padding: 0.6rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	select,
	input[type='number'] {
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 5px;
		color: var(--text);
		padding: 0.3rem;
	}

	input[type='number'] {
		width: 4rem;
	}

	input[name='workersPerTokenOverride'] {
		width: 6.5rem;
	}

	.workers-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		padding-bottom: 0.4rem;
	}

	button {
		background: #162040;
		border: 1px solid #1a2540;
		border-radius: 6px;
		color: var(--accent);
		padding: 0.4rem 0.8rem;
		cursor: pointer;
	}
</style>
