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

	test('uses template values for id, model, and created', async () => {
		const content = 'Test content';
		const chunks = await generateStreamingChunks(content);

		const firstChunk = JSON.parse(chunks[0].replace('data: ', ''));

		// Should use template values from openai_res.json
		expect(firstChunk.id).to.match(
			/^chatcmpl-6sf37lXn5paUcuf8UaurpMIKRMsTe/,
		);
		expect(firstChunk.model).to.eq('gpt-3.5-turbo-0301');
		expect(firstChunk.created).to.eq(1678485525);
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

	test('sets correct streaming headers', () => {
		const mockReply = {
			header: vi.fn(),
		};

		setStreamingHeaders(mockReply);

		expect(mockReply.header).toHaveBeenCalledWith(
			'Content-Type',
			'text/event-stream',
		);
		expect(mockReply.header).toHaveBeenCalledWith(
			'Cache-Control',
			'no-cache',
		);
		expect(mockReply.header).toHaveBeenCalledWith(
			'Connection',
			'keep-alive',
		);
		expect(mockReply.header).toHaveBeenCalledWith(
			'Access-Control-Allow-Origin',
			'*',
		);
		expect(mockReply.header).toHaveBeenCalledWith(
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
