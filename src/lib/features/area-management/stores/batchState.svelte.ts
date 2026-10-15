/**
 * Batch mode state — multi-area route generation, bulk worker editing, and
 * bulk vote-target editing.
 *
 * Manages the selected area set, the generation queue, and the inline worker
 * and vote-target form values. Route generation delegates to `routeState` so
 * all Kōji parameters stay consistent between single-area and batch modes.
 */
import { invalidateAll } from '$app/navigation';
import { postForm } from '$lib/utils/postForm';
import { routeState } from './routeState.svelte';
import type { Area } from '../types';

export type BatchStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface BatchItem {
	area: Area;
	status: BatchStatus;
	elapsed: number;
	stops?: number;
	message?: string;
}

class BatchStateClass {
	// ── Mode toggles ────────────────────────────────────────────────────────

	/** True when batch mode is active (checkboxes shown on cards). */
	batchMode = $state(false);

	/** Set of area IDs selected for the next batch operation. */
	batchSelectedIds = $state(new Set<number>());

	// ── Queue state ─────────────────────────────────────────────────────────

	/** Ordered list of batch items, one per selected area. */
	batchQueue = $state<BatchItem[]>([]);

	/** True while the batch generation loop is running. */
	batchRunning = $state(false);

	/** True when the batch generation panel is visible. */
	showBatchPanel = $state(false);

	private _batchItemTimers: Record<number, ReturnType<typeof setInterval>> = {};

	// ── Worker form state ───────────────────────────────────────────────────

	/** True when the inline batch worker form is expanded. */
	showBatchWorkers = $state(false);

	batchWorkerPokemon = $state(0);
	batchWorkerFort = $state(0);
	batchWorkerQuest = $state(0);
	batchWorkerRare = $state(0);

	/** True while the batch worker save is in flight. */
	batchWorkerSaving = $state(false);

	/** True after the batch workers have been successfully applied. */
	batchWorkerDone = $state(false);

	// ── Vote-target form state ──────────────────────────────────────────────

	/** True when the inline batch vote-target form is expanded. */
	showBatchTarget = $state(false);

	batchTargetMode = $state<'static' | 'workers'>('static');
	batchTargetStaticValue = $state(0);
	/** Empty string means "use the global workers-per-token default". */
	batchTargetWorkersPerTokenOverride = $state('');

	/** True while the batch vote-target save is in flight. */
	batchTargetSaving = $state(false);

	/** True after the batch vote-targets have been successfully applied. */
	batchTargetDone = $state(false);

	// ── Batch autoscale toggling ────────────────────────────────────────────

	/** True when the inline batch autoscale panel is expanded. */
	showBatchAutoscale = $state(false);

	/** True while a batch enable/disable is in flight. */
	batchAutoscaleSaving = $state(false);

	/** Outcome of the last batch enable/disable run, or null before one. */
	batchAutoscaleResult = $state<{
		action: 'enable' | 'disable';
		succeeded: number;
		failed: string[];
	} | null>(null);

	// ── Mode management ─────────────────────────────────────────────────────

	/**
	 * Open one of the inline batch forms (or close it if it's already open).
	 * Only one is shown at a time, so opening one closes the others rather
	 * than stacking them. Clears the form's previous "applied" result.
	 */
	toggleBatchForm(form: 'workers' | 'target' | 'autoscale'): void {
		const open =
			form === 'workers'
				? !this.showBatchWorkers
				: form === 'target'
					? !this.showBatchTarget
					: !this.showBatchAutoscale;
		this.showBatchWorkers = open && form === 'workers';
		this.showBatchTarget = open && form === 'target';
		this.showBatchAutoscale = open && form === 'autoscale';
		if (form === 'workers') this.batchWorkerDone = false;
		if (form === 'target') this.batchTargetDone = false;
		if (form === 'autoscale') this.batchAutoscaleResult = null;
	}

	/** Toggle batch mode on or off, resetting all selection and panel state. */
	toggleBatchMode(): void {
		this.batchMode = !this.batchMode;
		this.batchSelectedIds = new Set();
		if (!this.batchMode) {
			this.showBatchPanel = false;
			this.batchQueue = [];
		}
	}

	/** Toggle a single area's selection in the batch set. */
	toggleBatchSelect(id: number): void {
		if (this.batchSelectedIds.has(id)) {
			this.batchSelectedIds.delete(id);
		} else {
			this.batchSelectedIds.add(id);
		}
		this.batchSelectedIds = new Set(this.batchSelectedIds); // trigger reactivity
	}

	/** Initialise the batch queue from the current selection and open the panel. */
	openBatchPanel(areas: Area[]): void {
		this.batchQueue = [...this.batchSelectedIds]
			.map((id) => areas.find((a) => a.id === id))
			.filter((a): a is Area => !!a)
			.map((area) => ({ area, status: 'pending' as BatchStatus, elapsed: 0 }));
		this.showBatchPanel = true;
	}

	/**
	 * Leave the route generation panel and go back to the area list, keeping
	 * batch mode and the current selection. Does nothing while generation is
	 * still running.
	 */
	backToBatchList(): void {
		if (this.batchRunning) return;
		for (const t of Object.values(this._batchItemTimers)) clearInterval(t);
		this._batchItemTimers = {};
		this.showBatchPanel = false;
		this.batchQueue = [];
	}

	/** Close the batch panel and leave batch mode. Does nothing if generation is still running. */
	closeBatchPanel(): void {
		if (this.batchRunning) return;
		this.backToBatchList();
		this.batchMode = false;
		this.batchSelectedIds = new Set();
	}

	// ── Batch generation ────────────────────────────────────────────────────

	/**
	 * Run the batch generation loop: process each queued item sequentially,
	 * generating and auto-saving a route for each one. Updates item status
	 * (pending → running → done/error/skipped) in real time.
	 */
	async runBatchGeneration(): Promise<void> {
		if (this.batchRunning) return;
		this.batchRunning = true;

		for (let i = 0; i < this.batchQueue.length; i++) {
			const item = this.batchQueue[i];

			if (!item.area.geofence) {
				item.status = 'skipped';
				item.message = 'No geofence';
				this.batchQueue = [...this.batchQueue];
				continue;
			}

			item.status = 'running';
			item.elapsed = 0;
			this.batchQueue = [...this.batchQueue];

			this._batchItemTimers[i] = setInterval(() => {
				this.batchQueue[i].elapsed += 1;
				this.batchQueue = [...this.batchQueue];
			}, 1000);

			try {
				const { cacheKey, stops } = await routeState.generateRouteForBatch(item.area);
				await routeState.saveRouteForBatch(item.area.id, cacheKey);
				item.status = 'done';
				item.stops = stops;
			} catch (e) {
				item.status = 'error';
				item.message = e instanceof Error ? e.message : String(e);
			} finally {
				clearInterval(this._batchItemTimers[i]);
				delete this._batchItemTimers[i];
			}

			this.batchQueue = [...this.batchQueue];
		}

		this.batchRunning = false;
		await invalidateAll();
	}

	// ── Batch worker editing ────────────────────────────────────────────────

	/** Apply the current batch worker values to every selected area, via the existing saveWorkers action. */
	async runBatchWorkers(): Promise<void> {
		this.batchWorkerSaving = true;
		this.batchWorkerDone = false;
		for (const id of this.batchSelectedIds) {
			await postForm('?/saveWorkers', {
				areaId: String(id),
				pokemon_workers: String(this.batchWorkerPokemon),
				fort_workers: String(this.batchWorkerFort),
				quest_workers: String(this.batchWorkerQuest),
				rare_workers: String(this.batchWorkerRare)
			});
		}
		this.batchWorkerSaving = false;
		this.batchWorkerDone = true;
		await invalidateAll();
	}

	// ── Batch vote-target editing ───────────────────────────────────────────

	/**
	 * Apply the current batch Mode/Override values to every selected area,
	 * via the existing setAreaTarget action — same field shapes as
	 * VoteTargetForm's single-area form (`mode`, `staticValue`,
	 * `workersPerTokenOverride`).
	 */
	async runBatchTarget(): Promise<void> {
		this.batchTargetSaving = true;
		this.batchTargetDone = false;
		for (const id of this.batchSelectedIds) {
			await postForm('?/setAreaTarget', {
				areaId: String(id),
				mode: this.batchTargetMode,
				staticValue: String(this.batchTargetStaticValue),
				workersPerTokenOverride: this.batchTargetWorkersPerTokenOverride
			});
		}
		this.batchTargetSaving = false;
		this.batchTargetDone = true;
		await invalidateAll();
	}

	// ── Batch autoscale toggling ────────────────────────────────────────────

	/**
	 * Enable or disable autoscale for every selected area, via the existing
	 * single-area enableAutoscale/disableAutoscale actions — same as the
	 * worker/target batch operations above. Enabling can legitimately fail
	 * per-area (no vote target configured yet), so failures are collected by
	 * area name rather than silently ignored.
	 */
	private async _runBatchAutoscale(action: 'enable' | 'disable', areas: Area[]): Promise<void> {
		this.batchAutoscaleSaving = true;
		this.batchAutoscaleResult = null;

		let succeeded = 0;
		const failed: string[] = [];
		for (const id of this.batchSelectedIds) {
			const result = await postForm(
				action === 'enable' ? '?/enableAutoscale' : '?/disableAutoscale',
				{ areaId: String(id) }
			);
			if (result.ok) {
				succeeded++;
			} else {
				const name = areas.find((a) => a.id === id)?.name ?? `#${id}`;
				failed.push(result.message ? `${name} (${result.message})` : name);
			}
		}

		this.batchAutoscaleSaving = false;
		this.batchAutoscaleResult = { action, succeeded, failed };
		await invalidateAll();
	}

	async runBatchEnableAutoscale(areas: Area[]): Promise<void> {
		await this._runBatchAutoscale('enable', areas);
	}

	async runBatchDisableAutoscale(areas: Area[]): Promise<void> {
		await this._runBatchAutoscale('disable', areas);
	}
}

/** Singleton batch state — import in FilterBar, AreaCard, and BatchPanel. */
export const batchState = new BatchStateClass();
