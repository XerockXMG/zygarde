/**
 * Shared colour constants used across map rendering and the legend.
 * Centralised here so components stay consistent without hardcoding hex values.
 */
export const COLORS = {
	/** Enabled-area polygon / dot */
	enabled: '#38bdf8',
	/** Disabled-area polygon / dot */
	disabled: '#475569',
	/** Selected-area polygon highlight */
	selected: '#7dd3fc',
	/** Requested geofence highlight (admin area-request review map) */
	requestHighlight: '#f59e0b',
	/** Removal-request target area highlight (admin area-request review map) */
	removalTarget: '#ef4444',
	/** Pokemon route polyline */
	pokemon: '#10b981',
	/** Fort route polyline */
	fort: '#f59e0b',
	/** Quest route polyline */
	quest: '#a78bfa'
} as const;
