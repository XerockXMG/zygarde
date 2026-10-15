import { statSync } from 'node:fs';
import { extname } from 'node:path';

/**
 * Builds the tags `hooks.server.ts` swaps into app.html's `%zygarde.head%`
 * placeholder: the favicon link (default or operator-supplied) and the
 * optional Google Analytics snippet. Both are driven by runtime env vars so a
 * Docker image can be customised without a rebuild.
 */

export const HEAD_PLACEHOLDER = '%zygarde.head%';

const DEFAULT_FAVICON_LINK = '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />';

const FAVICON_TYPES: Record<string, string> = {
	'.ico': 'image/x-icon',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.gif': 'image/gif',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp'
};

/** Content type for a favicon file by extension, or null for an unsupported one. */
export function faviconContentType(path: string): string | null {
	return FAVICON_TYPES[extname(path).toLowerCase()] ?? null;
}

export interface CustomFavicon {
	path: string;
	contentType: string;
	/** File mtime in ms — used as a cache-busting query param on the link. */
	version: number;
}

/**
 * Resolves `FAVICON_PATH` to a usable file, or null (fall back to the bundled
 * favicon) when it's unset, missing, not a regular file, or an unsupported type.
 * Stats the file on each call so a replaced mount is picked up without a restart.
 */
export function resolveCustomFavicon(path: string | undefined): CustomFavicon | null {
	if (!path) return null;
	const contentType = faviconContentType(path);
	if (!contentType) return null;
	try {
		const stat = statSync(path);
		if (!stat.isFile()) return null;
		return { path, contentType, version: Math.floor(stat.mtimeMs) };
	} catch {
		return null;
	}
}

export function faviconLink(custom: CustomFavicon | null): string {
	if (!custom) return DEFAULT_FAVICON_LINK;
	return `<link rel="icon" href="/favicon?v=${custom.version}" type="${custom.contentType}" />`;
}

const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/i;

/**
 * The gtag.js snippet for a GA4 measurement ID, or '' when unset/invalid. The
 * ID is validated rather than escaped since it's interpolated into a script.
 * GA4's enhanced measurement tracks SvelteKit's client-side (history API)
 * navigations as page views on its own, so no per-navigation hook is needed.
 */
export function googleAnalyticsSnippet(measurementId: string | undefined): string {
	const id = measurementId?.trim();
	if (!id || !GA_ID_PATTERN.test(id)) return '';
	return (
		`<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>` +
		`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
		`gtag('js',new Date());gtag('config','${id}');</script>`
	);
}

export function buildHeadTags(env: { FAVICON_PATH?: string; GA_MEASUREMENT_ID?: string }): string {
	return [
		faviconLink(resolveCustomFavicon(env.FAVICON_PATH)),
		googleAnalyticsSnippet(env.GA_MEASUREMENT_ID)
	]
		.filter(Boolean)
		.join('\n\t\t');
}
