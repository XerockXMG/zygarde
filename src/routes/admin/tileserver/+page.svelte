<!-- src/routes/admin/tileserver/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AdminPage from '$lib/components/admin/AdminPage.svelte';
	import Panel from '$lib/components/admin/Panel.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const urlPlaceholder = 'https://{s}.example.com/{z}/{x}/{y}.png';

	const banner = $derived(
		form?.message
			? { kind: 'error' as const, text: form.message }
			: form?.success
				? { kind: 'success' as const, text: 'Saved. Reload the map to see the new tiles.' }
				: null
	);
</script>

<AdminPage
	title="Tileserver"
	meta="The tile server behind the area map, for everyone who views it."
	{banner}
>
	<Panel title="Tile source" hint="Any Leaflet-compatible XYZ tile URL works.">
		<form
			method="POST"
			action="?/saveSettings"
			class="tile-form"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			<label class="field">
				<span class="field-label">Tile URL template</span>
				<input
					class="input mono"
					type="text"
					name="urlTemplate"
					value={data.settings.urlTemplate}
					placeholder={urlPlaceholder}
				/>
				<span class="hint"
					>Use <code>{'{z}'}</code>, <code>{'{x}'}</code>, <code>{'{y}'}</code> for the tile and
					optionally <code>{'{s}'}</code> for subdomains.</span
				>
			</label>
			<label class="field">
				<span class="field-label">Attribution</span>
				<input class="input" type="text" name="attribution" value={data.settings.attribution} />
				<span class="hint">Shown in the map's corner; may contain HTML links.</span>
			</label>
			<div class="numbers">
				<label class="field">
					<span class="field-label">Max zoom</span>
					<input
						class="input"
						type="number"
						name="maxZoom"
						min="1"
						max="24"
						value={data.settings.maxZoom}
					/>
					<span class="hint">1–24</span>
				</label>
				<label class="field">
					<span class="field-label">Tile size (px)</span>
					<input
						class="input"
						type="number"
						name="tileSize"
						min="64"
						max="2048"
						value={data.settings.tileSize}
					/>
					<span class="hint">Usually 256; 512 for retina tiles</span>
				</label>
				<label class="field">
					<span class="field-label">Zoom offset</span>
					<input
						class="input"
						type="number"
						name="zoomOffset"
						min="-8"
						max="8"
						value={data.settings.zoomOffset}
					/>
					<span class="hint">-1 with 512px tiles</span>
				</label>
			</div>
			<div>
				<button type="submit" class="btn btn-primary">Save settings</button>
			</div>
		</form>
	</Panel>
</AdminPage>

<style>
	.tile-form {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: 1.1rem 1.5rem;
	}

	/* Zoom/size numbers and the save button span both columns. */
	.numbers,
	.tile-form > div:last-child {
		grid-column: 1 / -1;
	}

	.mono {
		font-family: ui-monospace, monospace;
		font-size: var(--text-sm);
	}

	code {
		font-family: ui-monospace, monospace;
		color: var(--text);
	}

	.numbers {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 12rem));
		gap: 1.25rem;
	}

	@media (max-width: 900px) {
		.tile-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 700px) {
		.numbers {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
