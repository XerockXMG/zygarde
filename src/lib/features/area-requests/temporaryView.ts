// Pure view helpers for the admin Temporary tab: no $env or server imports.
import type { TemporaryArea } from './server/temporary';

export type TemporaryState = 'scheduled' | 'active' | 'warned' | 'shut-off' | 'deleted';

export function temporaryState(row: TemporaryArea, areaExists: boolean): TemporaryState {
	if (!areaExists) return 'deleted';
	if (row.disabledAt) return 'shut-off';
	if (!row.startedAt) return 'scheduled';
	if (row.notifiedAt) return 'warned';
	return 'active';
}

const GROUP: Record<TemporaryState, number> = {
	active: 0,
	warned: 0,
	scheduled: 1,
	'shut-off': 2,
	deleted: 3
};

/** Active/warned by end date, then scheduled by start date, then shut-off, then deleted. */
export function sortTemporaryRows<T extends { row: TemporaryArea; state: TemporaryState }>(
	items: T[]
): T[] {
	return [...items].sort((a, b) => {
		const g = GROUP[a.state] - GROUP[b.state];
		if (g !== 0) return g;
		if (GROUP[a.state] === 0) return a.row.expiresOn.localeCompare(b.row.expiresOn);
		if (GROUP[a.state] === 1) return a.row.startsOn.localeCompare(b.row.startsOn);
		return a.row.expiresOn.localeCompare(b.row.expiresOn);
	});
}
