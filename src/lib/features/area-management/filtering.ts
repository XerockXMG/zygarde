import type { Area, CriteriaFilters } from './types';
import type { RouteRunsByArea } from './server/routeRuns';

const DAY_MS = 86_400_000;

export interface AreaFilterContext {
	/** Community tokens currently funding this area. */
	tokenTotal: number;
	/** Resolved numeric token target, or null when none is configured. */
	target: number | null;
	routeRuns: RouteRunsByArea[number] | undefined;
}

/**
 * Pure — no DB/store access, so it's usable from both the list's `$derived`
 * filter and (if ever needed) a server-side query. `now` defaults to the
 * real clock but is overridable for deterministic tests.
 */
export function matchesCriteriaFilters(
	area: Area,
	criteria: CriteriaFilters,
	context: AreaFilterContext,
	now: number = Date.now()
): boolean {
	if (criteria.tokenFunding !== 'ANY') {
		if (context.target === null) return false;
		if (criteria.tokenFunding === 'UNDER' && context.tokenTotal >= context.target) return false;
		if (criteria.tokenFunding === 'MEETING' && context.tokenTotal !== context.target) return false;
		if (criteria.tokenFunding === 'ABOVE' && context.tokenTotal <= context.target) return false;
	}

	const workerCount = area[criteria.workerMode].workers;
	if (criteria.workerMin !== null && workerCount < criteria.workerMin) return false;
	if (criteria.workerMax !== null && workerCount > criteria.workerMax) return false;

	if (criteria.routeFreshness !== 'ANY') {
		const run = context.routeRuns?.[criteria.routeType];
		if (criteria.routeFreshness === 'NEVER') {
			if (run) return false;
		} else {
			if (!run) return false;
			const days = (now - new Date(run.generatedAt).getTime()) / DAY_MS;
			if (criteria.routeFreshness === 'WITHIN_7D' && days > 7) return false;
			if (criteria.routeFreshness === 'WITHIN_30D' && days > 30) return false;
			if (criteria.routeFreshness === 'WITHIN_90D' && days > 90) return false;
			if (criteria.routeFreshness === 'STALE_90D' && days <= 90) return false;
		}
	}

	return true;
}
