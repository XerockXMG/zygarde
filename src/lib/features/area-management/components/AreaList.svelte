<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { AREA_PARAM, areaIdFromSearch } from '../deepLink';
	import {
		DEFAULT_CRITERIA_FILTERS,
		type Area,
		type CriteriaFilters,
		type Permissions,
		type LayerFilter,
		type SortMode
	} from '../types';
	import type { VoteDetail } from '$lib/features/voting/server/votes';
	import type { TargetConfig } from '$lib/features/voting/server/targets';
	import type { AutoscaleConfig } from '$lib/features/autoscale/types';
	import { mapState } from '$lib/features/map/stores/mapState.svelte';
	import { voteState } from '$lib/features/voting/stores/voteState.svelte';
	import { matchesCriteriaFilters } from '../filtering';
	import FilterBar from './FilterBar.svelte';
	import FilterPanel from './FilterPanel.svelte';
	import AreaCard from './AreaCard.svelte';
	import BatchPanel from './BatchPanel.svelte';
	import RequestPanel from '$lib/features/area-requests/components/RequestPanel.svelte';
	import type { RequestSummary } from '$lib/features/area-requests/server/requests';
	import type { ArchiveEntry } from '$lib/features/map/server/geofenceArchive';
	import type { RouteRunsByArea } from '../server/routeRuns';

	let {
		areas,
		permissions,
		tokenTotals,
		targetConfigs,
		autoscaleConfigs,
		voteDetailsByArea,
		loggedIn,
		myRequests,
		geofenceHistory,
		routeRuns
	}: {
		areas: Area[];
		permissions: Permissions;
		tokenTotals: Record<number, number>;
		targetConfigs: Record<number, TargetConfig>;
		autoscaleConfigs: Record<number, AutoscaleConfig>;
		voteDetailsByArea: Record<number, VoteDetail[]>;
		loggedIn: boolean;
		myRequests: RequestSummary[];
		geofenceHistory: Record<number, ArchiveEntry[]>;
		routeRuns: RouteRunsByArea;
	} = $props();

	let activeFilter = $state<LayerFilter>('ALL');
	let sortMode = $state<SortMode>('AZ');
	let expandedId = $state<number | null>(null);
	let criteriaFilters = $state<CriteriaFilters>({ ...DEFAULT_CRITERIA_FILTERS });

	onMount(() => {
		mapState.registerEditAreaCallback((areaId) => {
			expandedId = areaId;
		});
	});

	const sortedAreas = $derived(
		[...areas].sort((a, b) => {
			if (sortMode === 'VOTES') {
				return (tokenTotals[b.id] ?? 0) - (tokenTotals[a.id] ?? 0);
			}
			return a.name.localeCompare(b.name);
		})
	);

	const filteredAreas = $derived(
		sortedAreas.filter((a) => {
			if (activeFilter === 'ENABLED' && !a.enabled) return false;
			if (activeFilter === 'DISABLED' && a.enabled) return false;
			return matchesCriteriaFilters(a, criteriaFilters, {
				tokenTotal: tokenTotals[a.id] ?? 0,
				target: voteState.targets[a.id] ?? null,
				routeRuns: routeRuns[a.id]
			});
		})
	);

	function toggleExpanded(id: number) {
		expandedId = expandedId === id ? null : id;
	}

	// `/?area=<id>` (see ../deepLink.ts): once the map is ready, select that
	// area exactly as a list click would, then drop the param so a reload or
	// a later selection doesn't jump back to it.
	let deepLinkHandled = false;
	$effect(() => {
		if (deepLinkHandled || !mapState.mapReady) return;
		deepLinkHandled = true;
		const id = areaIdFromSearch(page.url.searchParams);
		if (id === null) return;
		const area = untrack(() => areas.find((a) => a.id === id));
		if (area) {
			expandedId = area.id;
			mapState.selectedId = area.id;
			mapState.mobileView = 'map';
			// Call the popup-then-fit routine directly rather than relying on
			// MapPanel's effect noticing mobileView change: mobileView persists
			// across visits, so it may already be 'map' and nothing would fire.
			// It waits a tick + frame, so it lands after initMap's fit-all.
			void mapState.onMobileMapActivated(untrack(() => areas));
			setTimeout(() => {
				document
					.getElementById('area-card-' + area.id)
					?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 50);
		}
		const url = new URL(page.url);
		url.searchParams.delete(AREA_PARAM);
		replaceState(url, {});
	});

	function selectFromList(area: Area) {
		toggleExpanded(area.id);
		mapState.selectedId = area.id;
		// Open the popup before fitting bounds — see the comment in
		// mapState.onMobileMapActivated for why the order matters.
		mapState.polygonMap.get(area.id)?.openPopup();
		mapState.focusArea(area);
		mapState.mobileView = 'map';
	}
</script>

<div class="area-list">
	<FilterBar
		{areas}
		{permissions}
		{activeFilter}
		onFilterChange={(f) => (activeFilter = f)}
		{sortMode}
		onSortChange={(s) => (sortMode = s)}
	/>

	<FilterPanel {permissions} bind:criteriaFilters />

	<BatchPanel {filteredAreas} />

	<div class="area-list-scroll">
		{#each filteredAreas as area (area.id)}
			<AreaCard
				{area}
				{areas}
				{permissions}
				expanded={expandedId === area.id}
				onSelect={() => selectFromList(area)}
				tokenTotal={tokenTotals[area.id] ?? 0}
				targetConfig={targetConfigs[area.id]}
				autoscaleConfig={autoscaleConfigs[area.id]}
				voteDetails={voteDetailsByArea[area.id] ?? []}
				{loggedIn}
				geofenceHistory={geofenceHistory[area.id] ?? []}
				routeRuns={routeRuns[area.id]}
			/>
		{/each}
	</div>

	<RequestPanel {myRequests} {loggedIn} />
</div>

<style>
	.area-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		height: 100%;
	}

	.area-list-scroll {
		flex: 1;
		overflow-y: auto;
		/* Room for the scrollbar so it doesn't sit on top of the cards. */
		padding-right: 0.35rem;
		scrollbar-gutter: stable;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
</style>
