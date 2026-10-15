/**
 * Convert an ISO date string or epoch-milliseconds number to a
 * human-friendly "time ago" label.
 * Examples: "just now", "5m ago", "3h ago", "2d ago", "2w ago", "3mo ago".
 * Returns "unknown" for an unparseable input.
 */
export function relativeTime(input: string | number): string {
	const time = new Date(input).getTime();
	if (Number.isNaN(time)) return 'unknown';

	const diffMs = Date.now() - time;
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return `${weeks}w ago`;
	return `${Math.floor(days / 30)}mo ago`;
}
