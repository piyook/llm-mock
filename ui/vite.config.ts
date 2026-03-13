import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte()],
	server: {
		port: 5173,
		strictPort: true,
		open: true,
		proxy: {
			'/ping': 'http://localhost:8001',
			'/ui-meta': 'http://localhost:8001',
			'/logs': 'http://localhost:8001',
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

