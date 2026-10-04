import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [svelte()],
	server: {
		port: 5173,
		strictPort: true,
		open: true,
		proxy: {
			'/ping': 'http://localhost:8001',
			'/ui-meta': 'http://localhost:8001',
			'/ui-stored-responses': 'http://localhost:8001',
			'/ui-rule-file': 'http://localhost:8001',
			'/ui-request-log': 'http://localhost:8001',
			'/api': 'http://localhost:8001',
			'/chatgpt': 'http://localhost:8001',
			'/models': 'http://localhost:8001',
		},
	},
	build: {
		assetsDir: 'assets',
		sourcemap: true,
	},
});
