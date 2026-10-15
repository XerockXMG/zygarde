<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Area } from '../types';

	let { area }: { area: Area } = $props();
</script>

<form
	method="POST"
	action="?/saveWorkers"
	use:enhance={() => {
		return ({ update }) => update({ reset: false });
	}}
>
	<input type="hidden" name="areaId" value={area.id} />

	<label>
		Pokemon
		<input type="number" name="pokemon_workers" min="0" value={area.pokemon_mode.workers} />
	</label>
	<label>
		Fort
		<input type="number" name="fort_workers" min="0" value={area.fort_mode.workers} />
	</label>
	<label>
		Quest
		<input type="number" name="quest_workers" min="0" value={area.quest_mode.workers} />
	</label>
	<label>
		Rare
		<input type="number" name="rare_workers" min="0" value={area.rare_pokemon_mode.workers} />
	</label>

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

	input[type='number'] {
		width: 4rem;
		background: #0d1425;
		border: 1px solid #1a2540;
		border-radius: 5px;
		color: var(--text);
		padding: 0.3rem;
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
