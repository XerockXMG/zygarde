import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user, siteName: env.SITE_NAME || 'Scanner Areas' };
};
