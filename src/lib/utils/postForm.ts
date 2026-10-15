import { deserialize } from '$app/forms';

export interface PostFormResult {
	ok: boolean;
	message?: string;
	data?: Record<string, unknown>;
}

/**
 * Post a SvelteKit form action from JavaScript and return whether it
 * succeeded. On failure, tries to extract the action's fail() message and
 * full data payload.
 */
export async function postForm(
	action: string,
	fields: Record<string, string>
): Promise<PostFormResult> {
	let res: Response;
	try {
		res = await fetch(action, {
			method: 'POST',
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
			body: new URLSearchParams(fields)
		});
	} catch {
		return { ok: false, message: 'Network error — please try again.' };
	}
	let result: ReturnType<typeof deserialize>;
	try {
		result = deserialize(await res.text());
	} catch {
		return { ok: false };
	}
	if (result.type === 'success') return { ok: true };
	if (result.type === 'failure') {
		const data = result.data as Record<string, unknown> | undefined;
		const message = typeof data?.message === 'string' ? data.message : undefined;
		return { ok: false, message, data };
	}
	return { ok: false };
}
