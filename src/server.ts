// The server process the CLI starts (`llmock start`); its settings come from
// the environment variables the CLI sets. To start a server from code, use
// startServer from src/index.ts.
import { bootServer } from './start-server.js';

try {
	const { app, port } = await bootServer();

	// Handle graceful shutdown
	const gracefulShutdown = async (signal: string) => {
		console.log(`\nReceived ${signal}, closing server gracefully...`);
		await app.close();
		process.exit(0);
	};

	process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
	process.on('SIGINT', () => gracefulShutdown('SIGINT'));

	// A detached `llmock start` waits for the port on this channel, which is
	// how it learns the port picked for --port=0
	process.send?.({ type: 'llmock:listening', port });
} catch (error) {
	console.error('Server startup error:', error);
	if (error instanceof Error) {
		console.error('Error details:', error.message);
		console.error('Error stack:', error.stack);
	}
	process.exit(1);
}
