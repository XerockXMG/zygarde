import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The tile server settings page used to live here; keep old links working. */
export const load: PageServerLoad = () => {
	redirect(308, '/admin/tileserver');
};
