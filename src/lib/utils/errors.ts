/** Extract a readable message from a caught value, for logging. */
export function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
