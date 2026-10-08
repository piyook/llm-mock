import type { FastifyInstance, FastifyReply } from 'fastify';
import { readsAsOff } from '../config/config-loader.js';
import { getChaosConfig, getChaosStats, resetChaos } from './chaos.js';
import {
	addRuntimeRule,
	clearRuntimeRules,
	describeActiveRules,
	removeRuntimeRule,
} from './runtime-rules.js';
import {
	changeChaos,
	changeDelay,
	getDelay,
	rememberStartupSettings,
	restoreStartupSettings,
} from './runtime-settings.js';

/**
 * Routes that change how the server replies while it runs, so a test can set
 * up a reply or a failure without editing the config file and restarting.
 * Nothing here is saved: a restart goes back to the config file.
 *
 * Off when ADMIN_API reads as off (`server.admin` in the config, or --admin).
 */
export const adminApiEnabled = (): boolean =>
	!readsAsOff(process.env?.ADMIN_API);

// The chaos settings in use, with the calls counted and failed so far
const describeChaos = () => ({
	chaos: getChaosConfig(),
	stats: getChaosStats(),
});

// Makes a change and answers with `result`, or with a 400 saying why the
// change can't be made
const answerChange = (
	reply: FastifyReply,
	change: () => void,
	result: () => unknown,
) => {
	try {
		change();
	} catch (error) {
		return reply.code(400).send({ error: (error as Error).message });
	}

	return reply.send(result());
};

function adminApi(app: FastifyInstance) {
	// What a reset goes back to
	rememberStartupSettings();

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

	app.get('/admin/chaos', async (_request, reply) => {
		return reply.send(describeChaos());
	});

	// Changes the chaos settings it is given. The call count is left alone:
	// reset first to have it start from 0
	app.patch('/admin/chaos', async (request, reply) => {
		return answerChange(
			reply,
			() => changeChaos(request.body),
			describeChaos,
		);
	});

	app.get('/admin/delay', async (_request, reply) => {
		return reply.send({ delay: getDelay() });
	});

	app.patch('/admin/delay', async (request, reply) => {
		return answerChange(
			reply,
			() => changeDelay(request.body),
			() => ({ delay: getDelay() }),
		);
	});

	// Back to how the server started: no runtime rules, the chaos and delay
	// settings of the config file, and the chaos count at 0, so a test can
	// rely on which call fails next
	app.post('/admin/reset', async (_request, reply) => {
		clearRuntimeRules();
		restoreStartupSettings();
		resetChaos();

		return reply.send({
			rules: describeActiveRules(),
			...describeChaos(),
			delay: getDelay(),
		});
	});
}

export default adminApi;
