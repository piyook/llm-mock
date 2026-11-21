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
	clearRecordedRequests,
	getRecordedRequest,
	getRecordedRequests,
	validateRequestFilter,
} from './request-recorder.js';
import {
	changeChaos,
	changeDelay,
	changeReplySettings,
	getDelay,
	getReplySettings,
	rememberStartupSettings,
	restoreStartupSettings,
} from './runtime-settings.js';
import {
	changeRecording,
	describeRecording,
	resetRecording,
} from './recordings.js';

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

	app.get('/admin/settings', async (_request, reply) => {
		return reply.send({ settings: getReplySettings() });
	});

	// Changes what a reply is (generated or stored, streamed or not) and
	// what is checked and logged
	app.patch('/admin/settings', async (request, reply) => {
		return answerChange(
			reply,
			() => changeReplySettings(request.body),
			() => ({ settings: getReplySettings() }),
		);
	});

	app.get('/admin/recording', async (_request, reply) => {
		return reply.send({ recording: describeRecording() });
	});

	// Pauses or resumes recording: while paused, a call no rule answers gets a
	// mock reply and nothing is sent to the upstream
	app.patch('/admin/recording', async (request, reply) => {
		return answerChange(
			reply,
			() => changeRecording(request.body),
			() => ({ recording: describeRecording() }),
		);
	});

	// The calls made to the chat and embeddings routes, oldest first, so a
	// test can check what its app sent. ?match=, ?in= and ?path= filter them.
	app.get('/admin/requests', async (request, reply) => {
		let filter;
		try {
			filter = validateRequestFilter(request.query);
		} catch (error) {
			return reply.code(400).send({ error: (error as Error).message });
		}

		return reply.send({ requests: getRecordedRequests(filter) });
	});

	app.get('/admin/requests/:id', async (request, reply) => {
		const { id } = request.params as { id: string };
		const recorded = getRecordedRequest(id);
		if (!recorded) {
			return reply
				.code(404)
				.send({ error: `No recorded request with id "${id}"` });
		}

		return reply.send({ request: recorded });
	});

	app.delete('/admin/requests', async (_request, reply) => {
		clearRecordedRequests();

		return reply.send({ requests: [] });
	});

	// Back to how the server started: no runtime rules, no recorded calls,
	// the chaos, delay and reply settings of the config file, recording not
	// paused with its counts at 0, and the chaos count at 0, so a test can rely on which call fails
	// next
	app.post('/admin/reset', async (_request, reply) => {
		clearRuntimeRules();
		clearRecordedRequests();
		restoreStartupSettings();
		resetChaos();
		resetRecording();

		return reply.send({
			rules: describeActiveRules(),
			...describeChaos(),
			delay: getDelay(),
			settings: getReplySettings(),
			recording: describeRecording(),
		});
	});
}

export default adminApi;
