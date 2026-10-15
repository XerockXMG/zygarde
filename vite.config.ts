import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '.env'), override: true });

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		environment: 'node',
		passWithNoTests: true
	}
});
