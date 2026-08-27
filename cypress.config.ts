import { defineConfig } from 'cypress';

export default defineConfig({
	e2e: {
		baseUrl: `http://localhost:${process.env.SERVER_PORT ?? '8001'}`,
	},
});
