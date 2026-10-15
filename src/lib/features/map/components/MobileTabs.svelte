<script lang="ts">
	/**
	 * Mobile tab switcher — toggles between List and Map views on narrow screens.
	 * Reads and writes mapState.mobileView.
	 */
	import { mapState } from '../stores/mapState.svelte';
</script>

<div class="mobile-tabs">
	<button
		class="mobile-tab"
		class:active={mapState.mobileView === 'list'}
		onclick={() => (mapState.mobileView = 'list')}
	>
		≡ List
	</button>
	<button
		class="mobile-tab"
		class:active={mapState.mobileView === 'map'}
		onclick={() => (mapState.mobileView = 'map')}
	>
		⌖ Map
	</button>
</div>

<style>
	/* Hidden on desktop — shown only inside the @media block below */
	.mobile-tabs {
		display: none;
	}

	@media (max-width: 768px) {
		.mobile-tabs {
			display: flex;
			gap: 0.2rem;
			background: #0d1425;
			border: 1px solid #1a2540;
			border-radius: 8px;
			padding: 0.25rem;
			margin-bottom: 0.75rem;
			flex-shrink: 0;
		}

		.mobile-tab {
			flex: 1;
			font-size: var(--text-sm);
			font-weight: 700;
			letter-spacing: 0.05em;
			text-transform: uppercase;
			padding: 0.5rem 0.5rem;
			border: none;
			border-radius: 6px;
			cursor: pointer;
			background: transparent;
			color: var(--text-muted);
			transition:
				background 0.15s,
				color 0.15s;
		}

		.mobile-tab.active {
			background: #162040;
			color: var(--accent);
		}
	}
</style>
