<!-- src/lib/features/area-requests/components/CreateAreaForm.svelte -->
<script lang="ts">
	/**
	 * The admin "Create Area" form for an addition request. Owns its own
	 * local state for the token-target/autoscale/Kōji sub-fields so their
	 * visibility can toggle without touching the parent list — the actual
	 * values still travel to the server the normal SvelteKit way, as named
	 * fields on the same `?/createArea` form submit.
	 */
	import { enhance } from '$app/forms';
	import { addDays, isStartDue, todayInZone } from '$lib/features/area-requests/dates';
	import type { AdminAreaRequest } from '$lib/features/area-requests/server/requests';

	let { req, kojiConfigured = false }: { req: AdminAreaRequest; kojiConfigured?: boolean } =
		$props();

	function parseGeofence(geofence: string): string {
		try {
			return JSON.stringify(JSON.parse(geofence), null, 2);
		} catch {
			return geofence;
		}
	}

	// Client-side hint only; the server decides using TEMP_AREA_TIMEZONE.
	const localToday = todayInZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
	// Initial values only: the admin may override the request's choices.
	// svelte-ignore state_referenced_locally
	let temporary = $state(req.isTemporary);
	// A request reviewed after its start date starts today (the server clamps the same way).
	// svelte-ignore state_referenced_locally
	let startsOn = $state(
		req.startsOn && req.startsOn < localToday ? localToday : (req.startsOn ?? '')
	);
	// svelte-ignore state_referenced_locally
	let expiresOn = $state(req.expiresOn ?? '');
	const expiresMin = $derived(
		addDays(startsOn && startsOn > localToday ? startsOn : localToday, 1)
	);
	const startFar = $derived(temporary && !!startsOn && !isStartDue(startsOn, localToday));

	let pokemonWorkers = $state('0');
	let setTarget = $state(false);
	let targetMode = $state<'static' | 'workers'>('static');
	let targetStaticValue = $state('0');
	let targetOverride = $state('');
	let enableAutoscaleFlag = $state(false);
	let setKojiGeofence = $state(false);
	let pending = $state(false);
</script>

<form
	method="POST"
	action="?/createArea"
	use:enhance={() => {
		pending = true;
		return async ({ update }) => {
			try {
				await update();
			} finally {
				pending = false;
			}
		};
	}}
	class="create-area-form"
>
	<input type="hidden" name="requestId" value={req.id} />
	<p class="card-label">Create area</p>
	<label class="field">
		<span class="field-label">Name</span>
		<input class="input" type="text" name="name" required />
	</label>
	<label class="check" class:disabled={temporary}>
		<input type="checkbox" name="enabled" value="1" checked disabled={temporary} />
		Enabled
	</label>
	{#if temporary}
		<span class="hint">Controlled by the start date</span>
	{/if}
	<div class="workers">
		<label class="field">
			<span class="field-label">Pokémon workers</span>
			<input
				class="input"
				type="number"
				name="pokemon_workers"
				min="0"
				bind:value={pokemonWorkers}
			/>
		</label>
		<label class="field">
			<span class="field-label">Fort workers</span>
			<input class="input" type="number" name="fort_workers" min="0" value="0" />
		</label>
		<label class="field">
			<span class="field-label">Quest workers</span>
			<input class="input" type="number" name="quest_workers" min="0" value="0" />
		</label>
		<label class="field">
			<span class="field-label">Rare workers</span>
			<input class="input" type="number" name="rare_workers" min="0" value="0" />
		</label>
	</div>
	<label class="field">
		<span class="field-label">Geofence (GeoJSON Polygon)</span>
		<textarea class="input" name="geofence" rows="6" value={parseGeofence(req.geofence)}></textarea>
	</label>

	<fieldset>
		<legend class="card-label">Temporary</legend>
		<label class="check">
			<input type="checkbox" name="temporary" value="1" bind:checked={temporary} />
			Temporary area
		</label>
		{#if temporary}
			<div class="workers">
				<label class="field">
					<span class="field-label">Starts on</span>
					<input
						class="input"
						type="date"
						name="startsOn"
						required
						min={localToday}
						bind:value={startsOn}
					/>
				</label>
				<label class="field">
					<span class="field-label">Expires on</span>
					<input
						class="input"
						type="date"
						name="expiresOn"
						required
						min={expiresMin}
						bind:value={expiresOn}
					/>
				</label>
			</div>
			{#if startFar}
				<span class="hint">Area is created off and turns on the day before the start date</span>
			{/if}
		{/if}
	</fieldset>

	<fieldset>
		<legend class="card-label">Token target &amp; autoscale</legend>
		<label class="check">
			<input type="checkbox" name="setTarget" value="1" bind:checked={setTarget} />
			Set a token target
		</label>
		{#if setTarget}
			<label class="field">
				<span class="field-label">Mode</span>
				<select class="input" name="targetMode" bind:value={targetMode}>
					<option value="static">Static number</option>
					<option value="workers">Based on Pokémon workers</option>
				</select>
			</label>
			{#if targetMode === 'static'}
				<label class="field">
					<span class="field-label">Value</span>
					<input
						class="input"
						type="number"
						name="targetStaticValue"
						min="0"
						bind:value={targetStaticValue}
					/>
				</label>
			{:else}
				<input type="hidden" name="targetStaticValue" value={targetStaticValue} />
				<span class="hint">Based on {pokemonWorkers || 0} Pokémon workers</span>
				<label class="field">
					<span class="field-label">Workers per token override</span>
					<input
						class="input"
						type="number"
						name="targetWorkersPerTokenOverride"
						min="1"
						placeholder="Global default"
						bind:value={targetOverride}
					/>
				</label>
			{/if}
		{/if}
		<label class="check" class:disabled={!setTarget}>
			<input
				type="checkbox"
				name="enableAutoscale"
				value="1"
				bind:checked={enableAutoscaleFlag}
				disabled={!setTarget}
			/>
			Enable autoscale
		</label>
		{#if !setTarget}
			<span class="hint">Autoscale needs a token target.</span>
		{/if}
	</fieldset>

	<fieldset>
		<legend class="card-label">Kōji geofence</legend>
		<label class="check">
			<input type="checkbox" name="setKojiGeofence" value="1" bind:checked={setKojiGeofence} />
			Also create this geofence in Kōji
		</label>
		{#if setKojiGeofence}
			<label class="field">
				<span class="field-label">Kōji geofence name</span>
				<input class="input" type="text" name="kojiGeofenceName" required />
				<span class="hint">Must not already exist in Kōji.</span>
			</label>
			<label class="field">
				<span class="field-label">Kōji parent (optional)</span>
				<input class="input" type="text" name="kojiProject" placeholder="Ungrouped" />
			</label>
		{/if}
	</fieldset>

	{#if kojiConfigured}
		<label class="check">
			<input type="checkbox" name="generateBootstrap" value="1" checked />
			Generate a bootstrap route in Kōji
		</label>
		<span class="hint">Can take up to 2 minutes</span>
	{/if}

	<input
		class="input"
		type="text"
		name="adminNote"
		placeholder="Admin note (optional)"
		aria-label="Admin note"
	/>
	<div>
		<button type="submit" class="btn btn-success" disabled={pending}>
			{pending ? 'Creating…' : 'Create area and approve'}
		</button>
	</div>
</form>

<style>
	/* Field, input, checkbox and button styles come from the admin layout (routes/admin/+layout.svelte). */
	.create-area-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.workers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		margin: 0;
		border: 1px solid #1a2540;
		border-radius: 10px;
		padding: 0.6rem 0.85rem 0.85rem;
	}

	legend {
		padding: 0 0.3rem;
	}

	.check.disabled {
		color: var(--text-muted);
		cursor: default;
	}
</style>
