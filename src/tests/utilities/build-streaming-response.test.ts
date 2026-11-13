/* eslint-disable  @typescript-eslint/naming-convention */
import { expect, test, describe, vi, beforeEach } from 'vitest';
import {
	generateStreamingChunks,
	setStreamingHeaders,
	streamWithDelay,
} from '../../utilities/build-streaming-response.js';

describe('build streaming response function works as expected', async () => {
	beforeEach(() => {
		process.env.LLM_MODEL = 'gpt-4o';
		process.env.LLM_NAME = 'openai';
		process.env.RESPONSE_DELAY_MIN = '0';
		process.env.RESPONSE_DELAY_MAX = '0';
	});

	test('generates streaming chunks with correct format', async () => {
		const content = 'Hello world test response';
		const chunks = await generateStreamingChunks(content);

		expect(chunks).to.be.an('array');
		expect(chunks.length).to.be.greaterThan(2); // At least role chunk, content chunk, final chunk, and [DONE]

		// Check last chunk is [DONE]
		expect(chunks[chunks.length - 1]).to.eq('data: [DONE]');

		// Check all chunks except last start with 'data: '
		for (let i = 0; i < chunks.length - 1; i++) {
			expect(chunks[i]).to.match(/^data: /);
		}

		// Parse and validate each chunk
		const dataChunks = chunks.slice(0, -1); // All except [DONE]
		dataChunks.forEach((chunkStr, index) => {
			const jsonStr = chunkStr.replace('data: ', '');
			const chunk = JSON.parse(jsonStr);

			// Validate chunk structure
			expect(chunk).to.have.property('id');
			expect(chunk).to.have.property('object', 'chat.completion.chunk');
			expect(chunk).to.have.property('created');
			expect(chunk).to.have.property('model');
			expect(chunk).to.have.property('choices');
			expect(chunk.choices).to.be.an('array');
			expect(chunk.choices).to.have.length(1);

			const choice = chunk.choices[0];
			expect(choice).to.have.property('index', 0);
			expect(choice).to.have.property('delta');
			expect(choice).to.have.property('finish_reason');

			// First chunk should have role in delta
			if (index === 0) {
				expect(choice.delta).to.have.property('role');
				expect(choice.delta.role).to.eq('assistant');
				void expect(choice.finish_reason).to.be.null;
			}

			// Last chunk should have finish_reason: 'stop' and empty delta
			if (index === dataChunks.length - 1) {
				expect(choice.finish_reason).to.eq('stop');
				expect(Object.keys(choice.delta)).to.have.length(0);
			}

			// Middle chunks should have content
			if (index > 0 && index < dataChunks.length - 1) {
				expect(choice.delta).to.have.property('content');
				void expect(choice.delta.content).to.be.a('string');
				void expect(choice.delta.content).to.not.be.empty;
			}
		});
	});

	test('uses template values for id and created, the preset model', async () => {
		const content = 'Test content';
		const chunks = await generateStreamingChunks(content);

		const firstChunk = JSON.parse(chunks[0].replace('data: ', ''));

		// Should use template values from openai_res.json
		expect(firstChunk.id).to.match(
			/^chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe/,
		);
		// No request model: the preset's
		expect(firstChunk.model).to.eq('gpt-4o');
		expect(firstChunk.created).to.eq(1678485525);
	});

	const parse = (chunks: string[]) =>
		chunks.slice(0, -1).map((chunk) => JSON.parse(chunk.slice(6)));

	test('echoes the request model in every chunk', async () => {
		const chunks = await generateStreamingChunks(
			'Test content',
			undefined,
			{
				model: 'gpt-5-mini',
				messages: [],
			},
		);

		for (const chunk of parse(chunks)) {
			expect(chunk.model).to.eq('gpt-5-mini');
		}
	});

	test('sends no usage unless the request asks for it', async () => {
		const chunks = await generateStreamingChunks(
			'Test content',
			undefined,
			{
				messages: [{ role: 'user', content: 'hi' }],
				stream_options: { include_usage: false },
			},
		);

		for (const chunk of parse(chunks)) {
			expect(chunk).not.to.have.property('usage');
		}
	});

	test('include_usage adds usage: null and a final usage chunk', async () => {
		const body = {
			messages: [{ role: 'user', content: 'How are you today?' }],
			stream_options: { include_usage: true },
		};
		const chunks = await generateStreamingChunks(
			'Fine thanks',
			undefined,
			body,
		);
		const parsed = parse(chunks);
		const usageChunk = parsed.at(-1);

		expect(chunks.at(-1)).to.eq('data: [DONE]');
		for (const chunk of parsed.slice(0, -1)) {
			expect(chunk.usage).to.eq(null);
		}
		expect(parsed.at(-2).choices[0].finish_reason).to.eq('stop');
		expect(usageChunk.choices).to.deep.eq([]);
		expect(usageChunk.usage).to.deep.eq({
			prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4),
			completion_tokens: Math.ceil('Fine thanks'.length / 4),
			total_tokens:
				Math.ceil(JSON.stringify(body.messages).length / 4) +
				Math.ceil('Fine thanks'.length / 4),
		});
	});

	test('other formats keep the template model and get no usage chunk', async () => {
		process.env.LLM_NAME = 'gemini';
		const chunks = await generateStreamingChunks(
			'Test content',
			undefined,
			{
				model: 'gpt-5-mini',
				stream_options: { include_usage: true },
			},
		);

		for (const chunk of parse(chunks)) {
			expect(chunk.model).not.to.eq('gpt-5-mini');
			expect(chunk).not.to.have.property('usage');
		}
	});

	test('splits content into multiple chunks', async () => {
		const longContent =
			'This is a very long response that should be split into multiple chunks for testing the streaming functionality.';
		const chunks = await generateStreamingChunks(longContent);

		const dataChunks = chunks.slice(0, -1); // All except [DONE]
		const contentChunks = dataChunks.filter((chunkStr, index) => {
			if (index === 0 || index === dataChunks.length - 1) return false; // Skip role and final chunks
			const chunk = JSON.parse(chunkStr.replace('data: ', ''));
			return chunk.choices[0].delta.content;
		});

		expect(contentChunks.length).to.be.greaterThan(1); // Should have multiple content chunks
	});

	test('handles empty content gracefully', async () => {
		const content = '';
		const chunks = await generateStreamingChunks(content);

		expect(chunks).to.be.an('array');
		expect(chunks.length).to.be.greaterThan(2); // Still should have role, final, and [DONE]
		expect(chunks[chunks.length - 1]).to.eq('data: [DONE]');
	});

	test('sets the streaming headers on the raw response', () => {
		const mockReply = {
			header: vi.fn(),
			raw: { setHeader: vi.fn() },
		};

		setStreamingHeaders(mockReply);

		// The stream is written to reply.raw, so Fastify's reply.header()
		// would never send them
		expect(mockReply.header).not.toHaveBeenCalled();
		expect(mockReply.raw.setHeader).toHaveBeenCalledWith(
			'Content-Type',
			'text/event-stream',
		);
		expect(mockReply.raw.setHeader).toHaveBeenCalledWith(
			'Cache-Control',
			'no-cache',
		);
		expect(mockReply.raw.setHeader).toHaveBeenCalledWith(
			'Connection',
			'keep-alive',
		);
		expect(mockReply.raw.setHeader).toHaveBeenCalledWith(
			'Access-Control-Allow-Origin',
			'*',
		);
		expect(mockReply.raw.setHeader).toHaveBeenCalledWith(
			'Access-Control-Allow-Headers',
			'Cache-Control',
		);
	});
});

describe('streaming with delay function', async () => {
	beforeEach(() => {
		process.env.RESPONSE_DELAY_MIN = '0';
		process.env.RESPONSE_DELAY_MAX = '0';
	});

	test('streams chunks without delay when delays are disabled', async () => {
		const chunks = [
			'data: {"id":"test-1","object":"chat.completion.chunk"}',
			'data: {"id":"test-2","object":"chat.completion.chunk"}',
			'data: [DONE]',
		];

		const mockReply = {
			raw: {
				write: vi.fn(),
				end: vi.fn(),
				destroyed: false,
			},
		};

		const startTime = Date.now();
		await streamWithDelay(chunks, mockReply);
		const endTime = Date.now();

		// Should complete quickly (under 200ms for no delay)
		expect(endTime - startTime).to.be.lessThan(200);

		// Should write all chunks
		expect(mockReply.raw.write).toHaveBeenCalledTimes(3);
		expect(mockReply.raw.write).toHaveBeenCalledWith(`${chunks[0]}\n\n`);
		expect(mockReply.raw.write).toHaveBeenCalledWith(`${chunks[1]}\n\n`);
		expect(mockReply.raw.write).toHaveBeenCalledWith(`${chunks[2]}\n\n`);
		expect(mockReply.raw.end).toHaveBeenCalled();
	});

	test('handles destroyed connection gracefully', async () => {
		const chunks = ['data: {"id":"test"}', 'data: [DONE]'];

		const mockReply = {
			raw: {
				write: vi.fn(),
				end: vi.fn(),
				destroyed: true, // Simulate destroyed connection
			},
		};

		// Should not throw error even with destroyed connection
		await expect(
			streamWithDelay(chunks, mockReply),
		).resolves.toBeUndefined();
	});
});
