<!-- src/lib/features/area-requests/components/RequestRemovalButton.svelte -->
<script lang="ts">
	import { requestState } from '../stores/requestState.svelte';
	import type { Area } from '$lib/features/area-management/types';

	let { area }: { area: Area } = $props();
</script>

<div class="request-removal-section">
	<button
		class="btn-request-removal"
		onclick={() => {
			requestState.enterRequestMode();
			requestState.captureArea(area);
		}}
	>
		Request Removal of This Area
	</button>
</div>

<style>
	.request-removal-section {
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid #1a2540;
	}

	.btn-request-removal {
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.35);
		color: var(--danger);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 0.3rem 0.75rem;
		border-radius: 5px;
		cursor: pointer;
		width: 100%;
	}

	.btn-request-removal:hover {
		background: rgba(245, 158, 11, 0.08);
		border-color: #f59e0b;
		color: var(--token);
	}
</style>
