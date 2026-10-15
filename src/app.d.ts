import type { SessionUser } from '$lib/features/auth/types';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
		}
	}
}

export {};
