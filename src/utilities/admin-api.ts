import type { FastifyInstance } from 'fastify';
import { resetChaos } from './chaos.js';
import {
	addRuntimeRule,
	clearRuntimeRules,
	describeActiveRules,
	removeRuntimeRule,
} from './runtime-rules.js';

/**
 * Routes that change how the server replies while it runs, so a test can set
 * up a reply without editing the config file and restarting. Nothing here is
 * saved: a restart goes back to the config file.
 *
 * Off when ADMIN_API is "false" (`server.admin` in the config, or --admin).
 */
export const adminApiEnabled = (): boolean =>
	process.env?.ADMIN_API?.toLowerCase() !== 'false';

function adminApi(app: FastifyInstance) {
	// Every rule in the order requests are matched against them
	app.get('/admin/rules', async (_request, reply) => {
		return reply.send({ rules: describeActiveRules() });
	});

	// Adds a runtime rule; it is matched before the config file's rules
	app.post('/admin/rules', async (request, reply) => {
		try {
			const { id } = addRuntimeRule(request.body);
			const rule = describeActiveRules().find((entry) => entry.id === id);

			return reply.code(201).send({ rule });
		} catch (error) {
			return reply.code(400).send({ error: (error as Error).message });
		}
	});

	app.delete('/admin/rules/:id', async (request, reply) => {
		const { id } = request.params as { id: string };

		if (!removeRuntimeRule(id)) {
			return reply
				.code(404)
				.send({ error: `No runtime rule with id "${id}"` });
		}

		return reply.send({ rules: describeActiveRules() });
	});

	// Removes every runtime rule; the config file's rules stay
	app.delete('/admin/rules', async (_request, reply) => {
		clearRuntimeRules();

		return reply.send({ rules: describeActiveRules() });
	});

	// Back to how the server started: no runtime rules, and the chaos count
	// at 0, so a test can rely on which call fails next
	app.post('/admin/reset', async (_request, reply) => {
		clearRuntimeRules();
		resetChaos();

		return reply.send({ rules: describeActiveRules() });
	});
}

export default adminApi;
