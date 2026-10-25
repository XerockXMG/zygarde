import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
	it('escapes every HTML-significant character', () => {
		expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
			'&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;'
		);
	});
});
