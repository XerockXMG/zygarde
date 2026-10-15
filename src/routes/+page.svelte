<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import AreaList from '$lib/features/area-management/components/AreaList.svelte';
	import MapPanel from '$lib/features/map/components/MapPanel.svelte';
	import MobileTabs from '$lib/features/map/components/MobileTabs.svelte';
	import Header from '$lib/components/Header.svelte';
	import { mapState } from '$lib/features/map/stores/mapState.svelte';
	import { voteState } from '$lib/features/voting/stores/voteState.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	$effect(() => {
		voteState.sync(
			data.allocations,
			data.tokenTotals,
			data.primaryAreaId,
			data.tokenBudget,
			data.targetsByArea
		);
	});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<main class="page">
	<Header user={data.user} siteName={data.siteName} areas={data.areas} />

	{#if form?.message}
		<p class="error-banner">{form.message}</p>
	{/if}

	<MobileTabs />

	<div class="split-layout">
		<div class="list-panel" class:mobile-hidden={mapState.mobileView === 'map'}>
			<AreaList
				areas={data.areas}
				permissions={data.permissions}
				tokenTotals={data.tokenTotals}
				targetConfigs={data.targetConfigs}
				autoscaleConfigs={data.autoscaleConfigs}
				voteDetailsByArea={data.voteDetailsByArea}
				loggedIn={!!data.user}
				myRequests={data.myRequests}
				geofenceHistory={data.geofenceHistory}
				routeRuns={data.routeRuns}
			/>
		</div>

		<MapPanel
			areas={data.areas}
			permissions={data.permissions}
			loggedIn={!!data.user}
			tileSettings={data.tileSettings}
			startView={data.startView}
		/>
	</div>
</main>

<style>
	.page {
		padding: 1.5rem 2rem;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.error-banner {
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: var(--danger);
		border-radius: 6px;
		padding: 0.5rem 0.8rem;
		font-size: var(--text-sm);
		margin: 0 0 1rem;
	}

	.split-layout {
		display: flex;
		gap: 1.25rem;
		flex: 1;
		min-height: 0;
	}

	.list-panel {
		width: 420px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 0;
		position: relative;
	}

	@media (max-width: 768px) {
		.page {
			padding: 1.25rem 1rem;
			height: auto;
			min-height: 100vh;
		}

		.split-layout {
			flex: none;
			flex-direction: column;
			height: auto;
		}

		.list-panel {
			width: 100%;
			flex: none;
			height: 65vh;
		}

		.mobile-hidden {
			display: none !important;
		}
	}
</style>
