/** Escape text for interpolation into HTML strings (Leaflet tooltips/popups render HTML). */
export function escapeHtml(s: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;'
	};
	return s.replace(/[&<>"']/g, (c) => map[c]);
}
