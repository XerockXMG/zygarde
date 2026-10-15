/**
 * Client-side token allocation state with optimistic updates.
 *
 * VoteButton and the map popup's allocation/primary controls both used to
 * derive their visual state purely from server-loaded props, so clicking
 * them felt laggy — the button only restyled after a full `invalidateAll()`
 * round trip (which re-runs the page's `load`, including a fresh Dragonite
 * area fetch). This store flips the relevant state synchronously on click so
 * the UI responds instantly, then fires the actual form action in the
 * background and reconciles with the server (admin vote details aren't
 * computed optimistically — they catch up via the trailing `invalidateAll()`).
 */
import { invalidateAll } from '$app/navigation';
import { postForm } from '$lib/utils/postForm';

class VoteStateClass {
	allocations = $state<Record<number, number>>({});
	tokenTotals = $state<Record<number, number>>({});
	primaryAreaId = $state<number | null>(null);
	budget = $state(0);
	/** Admin-configured funding goal per area; null where no target is set. Not
	 *  optimistically mutated — only changes via the admin form + invalidateAll. */
	targets = $state<Record<number, number | null>>({});

	get allocatedTotal(): number {
		return Object.values(this.allocations).reduce((sum, n) => sum + n, 0);
	}

	get remainingBudget(): number {
		return Math.max(0, this.budget - this.allocatedTotal);
	}

	/** Sync from freshly-loaded server data. Call whenever page data changes. */
	sync(
		allocations: Record<number, number>,
		tokenTotals: Record<number, number>,
		primaryAreaId: number | null,
		budget: number,
		targets: Record<number, number | null>
	): void {
		this.allocations = allocations;
		this.tokenTotals = tokenTotals;
		this.primaryAreaId = primaryAreaId;
		this.budget = budget;
		this.targets = targets;
	}

	private applyAllocationOptimistic(areaId: number, newAmount: number): void {
		const delta = newAmount - (this.allocations[areaId] ?? 0);
		this.allocations = { ...this.allocations, [areaId]: newAmount };
		this.tokenTotals = {
			...this.tokenTotals,
			[areaId]: Math.max(0, (this.tokenTotals[areaId] ?? 0) + delta)
		};
		if (newAmount === 0 && this.primaryAreaId === areaId) this.primaryAreaId = null;
	}

	async setAllocation(areaId: number, newAmount: number): Promise<void> {
		const amount = Math.max(0, newAmount);
		this.applyAllocationOptimistic(areaId, amount);
		const result = await postForm('?/allocateTokens', {
			id: String(areaId),
			amount: String(amount)
		});
		if (!result.ok) {
			alert(result.message ?? 'Failed to save your token allocation.');
		}
		await invalidateAll();
	}

	async setPrimary(areaId: number): Promise<void> {
		this.primaryAreaId = areaId;
		if ((this.allocations[areaId] ?? 0) === 0) {
			this.applyAllocationOptimistic(areaId, 1);
		}
		const result = await postForm('?/setPrimary', { id: String(areaId) });
		if (!result.ok) {
			alert(result.message ?? 'Failed to update your primary area.');
		}
		await invalidateAll();
	}

	async clearPrimary(): Promise<void> {
		this.primaryAreaId = null;
		const result = await postForm('?/setPrimary', { id: '0' });
		if (!result.ok) {
			alert(result.message ?? 'Failed to update your primary area.');
		}
		await invalidateAll();
	}
}

export const voteState = new VoteStateClass();
