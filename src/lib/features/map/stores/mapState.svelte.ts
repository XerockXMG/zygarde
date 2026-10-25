/**
 * Leaflet map state and rendering logic.
 *
 * Owns the Leaflet library reference, map instance, layer groups, and all
 * state that drives map display: selected area, hidden areas, layer visibility,
 * and the mobile view toggle. This is the app's first client-side store — a
 * deliberate, narrow exception to the rest of the app's prop-driven style,
 * justified by Leaflet's imperative/non-serializable API and by selection
 * state needing to be shared between sibling components (AreaList, MapPanel).
 */
import { tick, untrack } from 'svelte';
import type * as Leaflet from 'leaflet';
import type { Area } from '$lib/features/area-management/types';
import type { MapData, LatLngTuple } from '../types';
import type { TileSettings } from '../server/tileSettings';
import type { MapStartView } from '../server/startView';
import { COLORS } from '../colors';
import { calcAreaSqKm, geoJsonToLatLngs } from '../geometry';
import { editState } from './editState.svelte';
import { voteState } from '$lib/features/voting/stores/voteState.svelte';
import { spawnpointState } from '$lib/features/spawnpoints/stores/spawnpointState.svelte';
import { escapeHtml } from '$lib/utils/html';

/** Smooth-scroll the area card for `id` into view within the list panel. */
function scrollToArea(id: number): void {
	setTimeout(() => {
		document
			.getElementById('area-card-' + id)
			?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}, 50);
}

class MapStateClass {
	// ── Leaflet internals (not reactive — Leaflet manages its own DOM) ──────
	L: typeof Leaflet | null = null;
	map: Leaflet.Map | null = null;
	geofenceGroup: Leaflet.LayerGroup | null = null;
	pokemonGroup: Leaflet.LayerGroup | null = null;
	fortGroup: Leaflet.LayerGroup | null = null;
	questGroup: Leaflet.LayerGroup | null = null;
	previewRouteGroup: Leaflet.LayerGroup | null = null;
	/** "🪙 N" labels on the areas the viewer has put tokens on. */
	myTokenGroup: Leaflet.LayerGroup | null = null;
	polygonMap: Map<number, Leaflet.Polygon> = new Map();

	/**
	 * Per-area re-render closures for the spawnpoint count line inside an
	 * already-built popup. Popup content is a static DOM snapshot built once
	 * in `buildPopup` (Leaflet doesn't re-invoke it on open) — unlike the vote
	 * stepper, which is patched synchronously from its own click handler,
	 * `spawnpointState.counts` resolves later from a background fetch with no
	 * click to hook into, so `refreshSpawnpointPopups()` re-runs these instead.
	 * Rebuilt from scratch on every `rebuildGeofences()` call.
	 */
	private spawnRenderers: Map<number, () => void> = new Map();

	// ── Reactive state ──────────────────────────────────────────────────────
	/** True once Leaflet has initialised and layers are ready. */
	mapReady = $state(false);

	/**
	 * Reactive count of polygons in `polygonMap`.
	 *
	 * `polygonMap` itself is a plain `Map` (not `$state`) because Leaflet
	 * manages its own DOM and we don't want mutation tracking on every vertex.
	 * This separate counter is updated whenever `polygonMap` is rebuilt so
	 * templates that need to react to polygon availability (e.g. Hide All
	 * visibility) have a reactive signal to depend on.
	 */
	polygonCount = $state(0);

	/** ID of the currently selected area (drives polygon highlight + popup). */
	selectedId = $state<number | null>(null);

	/** Area IDs that have been hidden from the map by the user. */
	hiddenAreaIds = $state(new Set<number>());

	// Layer visibility toggles
	showGeofences = $state(true);
	showPokemonRoutes = $state(false);
	showFortRoutes = $state(false);
	showQuestRoutes = $state(false);

	/** Current panel shown on mobile: list view or map view. */
	mobileView = $state<'list' | 'map'>('list');

	// ── Callback registry ───────────────────────────────────────────────────
	/**
	 * Callback registered by AreaList so a polygon click can expand the
	 * matching area card in the list. Set via `registerEditAreaCallback()`.
	 */
	private _onEditArea: ((areaId: number) => void) | null = null;

	/**
	 * Register a callback that is called when the user clicks a polygon on
	 * the map, to expand/scroll to the matching card. Called by
	 * AreaList.svelte on mount.
	 */
	registerEditAreaCallback(fn: (areaId: number) => void): void {
		this._onEditArea = fn;
	}

	// ── Map initialisation ──────────────────────────────────────────────────

	/**
	 * Initialise the Leaflet map inside the given DOM element.
	 * Dynamically imports Leaflet (SSR-safe), sets up tile layer and layer
	 * groups, then rebuilds geofences and fits the initial bounds. `startView`
	 * (START_LAT/START_LON/START_ZOOM) is only what shows before that fit, or
	 * when there are no areas to fit.
	 */
	async initMap(
		el: HTMLElement,
		data: MapData,
		tileSettings: TileSettings,
		startView: MapStartView
	): Promise<void> {
		this.mapReady = false;
		this.L = (await import('leaflet')).default as unknown as typeof Leaflet;
		this.map = this.L.map(el, {
			zoomControl: true,
			scrollWheelZoom: true,
			doubleClickZoom: false
		}).setView([startView.lat, startView.lon], startView.zoom);

		this.L.tileLayer(tileSettings.urlTemplate, {
			attribution: tileSettings.attribution,
			maxZoom: tileSettings.maxZoom,
			tileSize: tileSettings.tileSize,
			zoomOffset: tileSettings.zoomOffset
		}).addTo(this.map);

		this.geofenceGroup = this.L.layerGroup().addTo(this.map);
		this.pokemonGroup = this.L.layerGroup();
		this.fortGroup = this.L.layerGroup();
		this.questGroup = this.L.layerGroup();
		this.previewRouteGroup = this.L.layerGroup().addTo(this.map);
		this.myTokenGroup = this.L.layerGroup().addTo(this.map);

		this.mapReady = true;
		this.rebuildGeofences(data);

		// Not animated: a zoom requested while Leaflet is still animating one is
		// silently dropped (_tryAnimatedZoom bails while _animatingZoom), so an
		// animated initial fit would swallow anything that focuses an area right
		// after the map is ready — e.g. AreaList's ?area= deep link.
		const allPoints = data.areas.flatMap((a) => geoJsonToLatLngs(a.geofence).flat());
		if (allPoints.length > 0) {
			this.map.fitBounds(this.L.latLngBounds(allPoints), { padding: [30, 30], animate: false });
		}
	}

	// ── Polygon rendering ───────────────────────────────────────────────────

	/**
	 * Compute Leaflet path options for a geofence polygon. `isCaptured` is a
	 * distinct highlight for an area picked up by area-request Select Area
	 * mode — visually different from ordinary browsing selection so the user
	 * gets feedback that their click registered as a selection.
	 */
	getPolyStyle(area: Area, isSelected: boolean, isCaptured = false): Leaflet.PathOptions {
		const color = isCaptured
			? COLORS.removalTarget
			: isSelected
				? COLORS.selected
				: area.enabled
					? COLORS.enabled
					: COLORS.disabled;
		return {
			color,
			fillColor: color,
			fillOpacity: isCaptured ? 0.25 : isSelected ? 0.2 : area.enabled ? 0.1 : 0.04,
			weight: isCaptured || isSelected ? 2.5 : area.enabled ? 2 : 1
		};
	}

	/**
	 * Re-render all geofence polygons. Clears existing polygons, recreates
	 * them from current area data, applies visibility rules (hidden areas),
	 * wires click handlers and popups, and restores any open popup that was
	 * active before the rebuild.
	 *
	 * `suppressClicks` also makes the polygons non-interactive (not just
	 * un-clicked): while freehand-drawing a new geofence, a Leaflet polygon
	 * would otherwise swallow map clicks that land on top of it, making it
	 * impossible to place a vertex over/near an existing area's outline.
	 * `interactive: false` makes the map click handler fire underneath it.
	 */
	rebuildGeofences(data: MapData, suppressClicks = false): void {
		if (!this.mapReady || !this.L || !this.geofenceGroup) return;

		untrack(() => {
			let openPopupAreaId: number | null = null;
			for (const [id, poly] of this.polygonMap) {
				if (poly.isPopupOpen()) {
					openPopupAreaId = id;
					break;
				}
			}

			this.geofenceGroup!.clearLayers();
			this.polygonMap.clear();
			this.spawnRenderers.clear();

			for (const area of data.areas) {
				if (area.id === editState.editingAreaId) continue;

				const rings = geoJsonToLatLngs(area.geofence).filter((r) => r.length >= 3);
				if (rings.length === 0) continue;

				const poly = this.L!.polygon(
					rings.map((ring) => [ring]),
					{
						...this.getPolyStyle(area, area.id === this.selectedId),
						interactive: !suppressClicks
					}
				)
					.bindPopup(this.buildPopup(area, data))
					.addTo(this.geofenceGroup!);

				if (!suppressClicks) {
					poly.on('click', () => {
						this.selectedId = area.id;
						scrollToArea(area.id);
						this.focusArea(area);
						this._onEditArea?.(area.id);
					});
				}

				this.polygonMap.set(area.id, poly);
			}

			for (const id of this.hiddenAreaIds) {
				const poly = this.polygonMap.get(id);
				if (poly) this.geofenceGroup!.removeLayer(poly);
			}

			this.polygonCount = this.polygonMap.size;

			if (openPopupAreaId !== null) {
				this.polygonMap.get(openPopupAreaId)?.openPopup();
			}
		});
		this.renderMyTokenMarkers();
	}

	/**
	 * Label every visible area the viewer has tokens on with "🪙 N" (plus ♥
	 * for their primary area) at the centre of its polygon, so they can see at
	 * a glance where their tokens are. Re-run after a rebuild and whenever
	 * the viewer's allocations change.
	 */
	renderMyTokenMarkers(): void {
		if (!this.mapReady || !this.L || !this.myTokenGroup) return;
		const L = this.L;
		const group = this.myTokenGroup;
		untrack(() => {
			group.clearLayers();
			for (const [id, poly] of this.polygonMap) {
				const amount = voteState.allocations[id] ?? 0;
				if (amount <= 0 || this.hiddenAreaIds.has(id)) continue;
				const heart = voteState.primaryAreaId === id ? '♥ ' : '';
				L.marker(poly.getBounds().getCenter(), {
					interactive: false,
					keyboard: false,
					icon: L.divIcon({
						className: 'my-token-marker',
						html: `<span>${heart}🪙 ${amount}</span>`,
						iconSize: undefined
					})
				}).addTo(group);
			}
		});
	}

	/** Re-render a single route type layer (pokemon, fort, or quest). */
	rebuildRoutes(
		group: Leaflet.LayerGroup,
		mode: 'pokemon_mode' | 'fort_mode' | 'quest_mode',
		color: string,
		areas: Area[]
	): void {
		if (!this.mapReady || !this.L) return;
		group.clearLayers();
		for (const area of areas) {
			if (!area.enabled || this.hiddenAreaIds.has(area.id)) continue;
			const route = area[mode].route;
			if (route.length < 2) continue;
			const coords: LatLngTuple[] = route.map((p) => [p.lat, p.lon]);
			this.L.polyline(coords, { color, weight: 1.5, opacity: 0.75 })
				.bindTooltip(escapeHtml(area.name), { sticky: true })
				.addTo(group);
		}
	}

	/** Update polygon stroke/fill colours when the selection changes. */
	updatePolyStyles(areas: Area[]): void {
		if (!this.mapReady) return;
		for (const [id, poly] of this.polygonMap) {
			const area = areas.find((a) => a.id === id);
			if (area) poly.setStyle(this.getPolyStyle(area, id === this.selectedId));
		}
	}

	/**
	 * Re-render the spawnpoint count line in every currently-built popup from
	 * live `spawnpointState`. Call whenever `spawnpointState.counts`,
	 * `loadingIds`, or `mode` change — see `spawnRenderers` for why this can't
	 * just be handled at popup-build time.
	 */
	refreshSpawnpointPopups(): void {
		for (const render of this.spawnRenderers.values()) render();
	}

	// ── Navigation helpers ──────────────────────────────────────────────────

	/**
	 * Select an area from outside the list or map (e.g. the header's token
	 * menu): highlight it, expand and scroll to its card, open its popup and
	 * fit the map to it — the same result as clicking its polygon.
	 */
	selectArea(area: Area): void {
		// A hidden polygon isn't on the map, so it can't open a popup.
		if (this.hiddenAreaIds.has(area.id)) this.toggleHide(area);
		this.selectedId = area.id;
		this._onEditArea?.(area.id);
		scrollToArea(area.id);
		if (this.mobileView !== 'map') {
			// MapPanel's mobileView effect runs onMobileMapActivated, which opens
			// the popup and focuses the selected area once the map is visible.
			this.mobileView = 'map';
			return;
		}
		// Popup before fit — see onMobileMapActivated for why the order matters.
		this.polygonMap.get(area.id)?.openPopup();
		this.focusArea(area);
	}

	/** Fit the map viewport to the geofence of the given area. */
	focusArea(area: Area): void {
		if (!this.mapReady || !this.L || !this.map) return;
		const points = geoJsonToLatLngs(area.geofence).flat();
		if (points.length < 3) return;
		this.map.fitBounds(this.L.latLngBounds(points), { padding: [50, 50] });
	}

	/** Fit the map viewport to all enabled, visible areas. */
	fitAll(areas: Area[]): void {
		if (!this.mapReady || !this.L || !this.map) return;
		const all = areas
			.filter((a) => a.enabled && !this.hiddenAreaIds.has(a.id))
			.flatMap((a) => geoJsonToLatLngs(a.geofence).flat());
		if (all.length > 0) this.map.fitBounds(this.L.latLngBounds(all), { padding: [30, 30] });
	}

	// ── Visibility helpers ──────────────────────────────────────────────────

	/** Toggle a single area's visibility on the map. */
	toggleHide(area: Area): void {
		if (!this.mapReady || !this.geofenceGroup) return;
		const poly = this.polygonMap.get(area.id);
		if (!poly) return;
		if (this.hiddenAreaIds.has(area.id)) {
			this.hiddenAreaIds.delete(area.id);
			this.geofenceGroup.addLayer(poly);
		} else {
			this.hiddenAreaIds.add(area.id);
			this.geofenceGroup.removeLayer(poly);
		}
		this.hiddenAreaIds = new Set(this.hiddenAreaIds); // trigger reactivity
	}

	/** Make all currently hidden areas visible. */
	showAll(): void {
		if (!this.mapReady || !this.geofenceGroup) return;
		for (const id of this.hiddenAreaIds) {
			const poly = this.polygonMap.get(id);
			if (poly) this.geofenceGroup.addLayer(poly);
		}
		this.hiddenAreaIds = new Set();
	}

	/** Hide all areas from the map. */
	hideAll(): void {
		if (!this.mapReady || !this.geofenceGroup) return;
		for (const [id, poly] of this.polygonMap) {
			if (!this.hiddenAreaIds.has(id)) this.geofenceGroup.removeLayer(poly);
			this.hiddenAreaIds.add(id);
		}
		this.hiddenAreaIds = new Set(this.hiddenAreaIds); // trigger reactivity
	}

	// ── Mobile resize ───────────────────────────────────────────────────────

	/**
	 * Invalidate Leaflet's size after the map panel becomes visible on mobile,
	 * then zoom to the selected area (or fit all if nothing is selected).
	 */
	async onMobileMapActivated(areas: Area[]): Promise<void> {
		if (!this.mapReady || !this.L || !this.map) return;
		// ResizeObserver in MapPanel handles invalidateSize() when the container
		// becomes visible. Wait one tick + one rAF so that invalidateSize() has
		// already fired before we call fitBounds / focusArea.
		await tick();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const area = areas.find((a) => a.id === this.selectedId);
		if (area) {
			// Open the popup *before* fitting bounds: opening a popup triggers
			// Leaflet's own autoPan, which would otherwise run after focusArea
			// and nudge the just-centered view again to reveal the popup,
			// leaving the area off-center at the edge of the viewport instead.
			this.polygonMap.get(area.id)?.openPopup();
			this.focusArea(area);
		} else {
			const allPoints = areas.flatMap((a) => geoJsonToLatLngs(a.geofence).flat());
			if (allPoints.length > 0)
				this.map.fitBounds(this.L.latLngBounds(allPoints), { padding: [30, 30] });
		}
	}

	// ── Popup construction ──────────────────────────────────────────────────

	/**
	 * Build the Leaflet popup DOM element for an area: name + status, computed
	 * size, admin-only worker counts, spawnpoint count (for users permitted to
	 * see it), community token total/target (everyone), vote/primary buttons
	 * (logged-in users), and a hide/show toggle.
	 */
	buildPopup(area: Area, data: MapData): HTMLElement {
		const div = document.createElement('div');
		div.style.cssText = 'font-family:sans-serif;min-width:220px;padding:4px 0';
		const statusColor = area.enabled ? COLORS.enabled : '#94a3b8';
		const isAdmin = data.permissions.canEdit;

		const rings = geoJsonToLatLngs(area.geofence).filter((r) => r.length >= 3);
		const areaSqKm = rings.reduce((sum, ring) => sum + calcAreaSqKm(ring), 0);
		const areaSqMi = areaSqKm * 0.386102;
		const areaStr =
			areaSqKm >= 1
				? `${areaSqKm.toFixed(1)} km² / ${areaSqMi.toFixed(1)} mi²`
				: `${(areaSqKm * 1e6).toFixed(0)} m² / ${areaSqMi.toFixed(3)} mi²`;

		// Always visible (not just to admins) — the community total/target is
		// the one place every viewer sees area funding progress; the stepper
		// below only shows this viewer's own allocation.
		const tokenTotal = voteState.tokenTotals[area.id] ?? 0;
		const tokenTarget = voteState.targets[area.id] ?? null;
		const tokenStatsAboveThis = isAdmin || data.permissions.canSeeSpawnpoints;

		div.innerHTML = `
			<strong style="display:block;color: var(--text);font-size:1em;font-weight:700;margin-bottom:5px;letter-spacing:0.02em">${escapeHtml(area.name)}</strong>
			<span style="font-size:var(--text-xs);color:${statusColor};font-weight:700;text-transform:uppercase;letter-spacing:.07em">${area.enabled ? '● Enabled' : '○ Disabled'}</span>
			${areaSqKm > 0 ? `<div style="font-size:var(--text-xs);color: var(--text-secondary);margin-top:4px">${areaStr}</div>` : ''}
			${
				isAdmin
					? `
			<div style="font-size:var(--text-sm);color: var(--text-secondary);margin-top:10px;border-top:1px solid #1a2540;padding-top:8px">
				<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Pokemon workers</span><b style="color: var(--success)">${area.pokemon_mode.workers}</b></div>
				<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Fort workers</span><b style="color: var(--token)">${area.fort_mode.workers}</b></div>
				<div style="display:flex;justify-content:space-between"><span>Quest workers</span><b style="color: var(--violet)">${area.quest_mode.workers}</b></div>
			</div>`
					: ''
			}
			${data.permissions.canSeeSpawnpoints ? '<div data-spawn-slot></div>' : ''}
			<div style="font-size:var(--text-sm);color: var(--text-secondary);margin-top:${tokenStatsAboveThis ? '4' : '10'}px;${tokenStatsAboveThis ? '' : 'border-top:1px solid #1a2540;padding-top:8px;'}display:flex;justify-content:space-between">
				<span>🪙 Tokens</span>
				<b style="color: var(--token)">${tokenTotal}${tokenTarget !== null ? `/${tokenTarget}` : ''}</b>
			</div>
		`;

		if (data.permissions.canSeeSpawnpoints) {
			// Built as live DOM (not baked into the innerHTML string above) and
			// re-rendered via `spawnRenderers` whenever spawnpointState changes —
			// the background fetch that resolves "Loading…" into a real count
			// finishes well after this popup is built, with no click of its own
			// to hook a synchronous patch into like the vote stepper below does.
			const spawnRow = document.createElement('div');
			spawnRow.style.cssText = `font-size:var(--text-sm);color: var(--text-secondary);margin-top:${isAdmin ? '4' : '10'}px;${isAdmin ? '' : 'border-top:1px solid #1a2540;padding-top:8px;'}display:flex;justify-content:space-between`;
			const label = document.createElement('span');
			const modeSpan = document.createElement('span');
			modeSpan.style.opacity = '0.6';
			const countB = document.createElement('b');
			countB.style.color = 'var(--success)';
			label.append('Spawnpoints ', modeSpan);
			spawnRow.append(label, countB);

			const renderSpawnCount = () => {
				modeSpan.textContent = `(${spawnpointState.mode})`;
				const entry = spawnpointState.counts[area.id];
				const loading = spawnpointState.loadingIds.has(area.id);
				countB.textContent = entry ? entry.count.toLocaleString() : loading ? 'Loading…' : '—';
			};
			renderSpawnCount();
			this.spawnRenderers.set(area.id, renderSpawnCount);

			div.querySelector('[data-spawn-slot]')?.replaceWith(spawnRow);
		}

		if (data.loggedIn) {
			// Read live from voteState (not the `data` snapshot) and patch these
			// controls in place on click, rather than waiting for the next full
			// rebuildGeofences() — that's what made popup voting feel laggy before.
			// voteState.setAllocation/setPrimary/clearPrimary apply their optimistic
			// state update synchronously (before their first `await`), so calling
			// render*() right after firing one already sees the new value.
			const stepperRow = document.createElement('div');
			stepperRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:10px';
			const minusBtn = document.createElement('button');
			const countLabel = document.createElement('span');
			const plusBtn = document.createElement('button');
			const primaryBtn = document.createElement('button');

			const stepBtnStyle =
				'background:#162040;border:1px solid #334155;color: var(--text-secondary);font-size:var(--text-sm);font-weight:700;width:26px;height:26px;border-radius:6px;cursor:pointer';

			const renderStepper = () => {
				const mine = voteState.allocations[area.id] ?? 0;
				minusBtn.textContent = '−';
				minusBtn.style.cssText = stepBtnStyle;
				minusBtn.disabled = mine === 0;
				minusBtn.style.opacity = mine === 0 ? '0.4' : '1';
				minusBtn.title = 'Remove a token';

				plusBtn.textContent = '+';
				plusBtn.style.cssText = stepBtnStyle;
				plusBtn.disabled = voteState.remainingBudget <= 0;
				plusBtn.style.opacity = voteState.remainingBudget <= 0 ? '0.4' : '1';
				plusBtn.title =
					voteState.remainingBudget > 0 ? 'Add a token' : 'No tokens left in your budget';

				countLabel.textContent = `${mine}`;
				countLabel.title = 'Your tokens on this area';
				countLabel.style.cssText =
					'font-size:var(--text-sm);font-weight:700;color: var(--token);flex:1;text-align:center';
			};

			const renderPrimaryButton = () => {
				const isPrimary = voteState.primaryAreaId === area.id;
				if (isPrimary) {
					primaryBtn.innerHTML = '♥ My Primary Area';
					primaryBtn.style.cssText = [
						'display:block;width:100%;margin-top:6px',
						'background:rgba(251,113,133,0.15);border:1px solid #fb7185;color: var(--rose)',
						'font-size:var(--text-sm);font-weight:700;padding:7px 12px;border-radius:6px',
						'cursor:pointer;letter-spacing:0.04em;text-align:left'
					].join(';');
					primaryBtn.title = 'Click to remove primary status';
				} else {
					primaryBtn.innerHTML = '♥ Mark as Primary';
					primaryBtn.style.cssText = [
						'display:block;width:100%;margin-top:6px',
						'background:transparent;border:1px solid #334155;color: var(--text-muted)',
						'font-size:var(--text-sm);font-weight:700;padding:7px 12px;border-radius:6px',
						'cursor:pointer;letter-spacing:0.04em;text-align:left'
					].join(';');
					primaryBtn.title = 'Mark as my primary area';
				}
			};

			minusBtn.onclick = () => {
				const mine = voteState.allocations[area.id] ?? 0;
				voteState.setAllocation(area.id, Math.max(0, mine - 1)).then(() => {
					renderStepper();
					renderPrimaryButton();
				});
				renderStepper();
				renderPrimaryButton();
			};

			plusBtn.onclick = () => {
				const mine = voteState.allocations[area.id] ?? 0;
				voteState.setAllocation(area.id, mine + 1).then(() => {
					renderStepper();
					renderPrimaryButton();
				});
				renderStepper();
				renderPrimaryButton();
			};

			primaryBtn.onclick = () => {
				const action =
					voteState.primaryAreaId === area.id
						? voteState.clearPrimary()
						: voteState.setPrimary(area.id);
				action.then(() => {
					renderStepper();
					renderPrimaryButton();
				});
				renderStepper();
				renderPrimaryButton();
			};

			renderStepper();
			renderPrimaryButton();
			stepperRow.appendChild(minusBtn);
			stepperRow.appendChild(countLabel);
			stepperRow.appendChild(plusBtn);
			div.appendChild(stepperRow);
			div.appendChild(primaryBtn);
		}

		const hideBtn = document.createElement('button');
		const isHidden = this.hiddenAreaIds.has(area.id);
		hideBtn.textContent = isHidden ? '👁 Show on map' : '⊘ Hide from map';
		hideBtn.style.cssText =
			'display:block;width:100%;margin-top:8px;background:transparent;border:1px solid #334155;color: var(--text-muted);font-size:var(--text-xs);font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;letter-spacing:0.04em;text-align:left';
		hideBtn.onclick = () => {
			this.map?.closePopup();
			this.toggleHide(area);
		};
		div.appendChild(hideBtn);

		return div;
	}
}

/** Singleton map state — import in any component that needs Leaflet or map rendering. */
export const mapState = new MapStateClass();
