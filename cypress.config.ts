import { defineConfig } from 'cypress';

export default defineConfig({
    e2e: {
        setupNodeEvents(on, config) {
            // implement node event listeners here
        },
        baseUrl: `http://127.0.0.1:${process.env.SERVER_PORT ?? '8001'}`,
    },
});
