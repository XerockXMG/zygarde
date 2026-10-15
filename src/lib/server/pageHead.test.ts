import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildHeadTags,
	faviconContentType,
	faviconLink,
	googleAnalyticsSnippet,
	resolveCustomFavicon
} from './pageHead';

const dir = mkdtempSync(join(tmpdir(), 'zygarde-favicon-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('faviconContentType', () => {
	it('maps known extensions case-insensitively', () => {
		expect(faviconContentType('/x/favicon.ICO')).toBe('image/x-icon');
		expect(faviconContentType('/x/icon.png')).toBe('image/png');
		expect(faviconContentType('/x/icon.txt')).toBeNull();
	});
});

describe('resolveCustomFavicon', () => {
	it('returns null when unset, missing, a directory, or an unsupported type', () => {
		const sub = join(dir, 'folder.ico');
		mkdirSync(sub);
		const txt = join(dir, 'icon.txt');
		writeFileSync(txt, 'x');
		expect(resolveCustomFavicon(undefined)).toBeNull();
		expect(resolveCustomFavicon('')).toBeNull();
		expect(resolveCustomFavicon(join(dir, 'missing.ico'))).toBeNull();
		expect(resolveCustomFavicon(sub)).toBeNull();
		expect(resolveCustomFavicon(txt)).toBeNull();
	});

	it('resolves an existing file with its type and mtime version', () => {
		const file = join(dir, 'favicon.ico');
		writeFileSync(file, 'icon');
		const custom = resolveCustomFavicon(file);
		expect(custom).toMatchObject({ path: file, contentType: 'image/x-icon' });
		expect(custom!.version).toBeGreaterThan(0);
	});
});

describe('faviconLink', () => {
	it('falls back to the bundled svg', () => {
		expect(faviconLink(null)).toContain('href="/favicon.svg"');
	});

	it('points at the /favicon route with a cache-busting version', () => {
		expect(faviconLink({ path: '/f.png', contentType: 'image/png', version: 42 })).toBe(
			'<link rel="icon" href="/favicon?v=42" type="image/png" />'
		);
	});
});

describe('googleAnalyticsSnippet', () => {
	it('is empty when unset or not a GA4 measurement ID', () => {
		expect(googleAnalyticsSnippet(undefined)).toBe('');
		expect(googleAnalyticsSnippet('  ')).toBe('');
		expect(googleAnalyticsSnippet('UA-12345-1')).toBe('');
		expect(googleAnalyticsSnippet("G-ABC');alert(1)//")).toBe('');
	});

	it('emits gtag.js configured for the ID', () => {
		const snippet = googleAnalyticsSnippet(' G-AB12CD34EF ');
		expect(snippet).toContain('googletagmanager.com/gtag/js?id=G-AB12CD34EF');
		expect(snippet).toContain("gtag('config','G-AB12CD34EF')");
	});
});

describe('buildHeadTags', () => {
	it('always includes a favicon link and only adds GA when configured', () => {
		expect(buildHeadTags({})).toBe(faviconLink(null));
		expect(buildHeadTags({ GA_MEASUREMENT_ID: 'G-AB12CD34EF' })).toContain('gtag');
	});
});
