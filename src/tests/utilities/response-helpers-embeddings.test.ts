/* eslint-disable  @typescript-eslint/naming-convention */
import { expect, test, describe, beforeEach } from 'vitest';
import {
	generateMockEmbedding,
	generateMockEmbeddings,
} from '../../utilities/response-helpers.js';

describe('embeddings helper functions work as expected', async () => {
	beforeEach(() => {
		// Set up environment variables for testing
		process.env.EMBEDDING_DIMENSION = '128';
		process.env.LLM_NAME = 'openai';
	});

	test('generateMockEmbedding creates deterministic embeddings', async () => {
		const input = 'test input';
		const model = 'text-embedding-ada-002';
		const dimensions = 128;

		const embedding1 = await generateMockEmbedding(
			input,
			model,
			dimensions,
		);
		const embedding2 = await generateMockEmbedding(
			input,
			model,
			dimensions,
		);

		expect(embedding1).toBeInstanceOf(Array);
		expect(embedding1).toHaveLength(dimensions);
		expect(embedding1).toStrictEqual(embedding2); // Deterministic
		expect(typeof embedding1[0]).toBe('number');
		expect(embedding1[0]).toBeGreaterThanOrEqual(-1);
		expect(embedding1[0]).toBeLessThanOrEqual(1);
	});

	test('generateMockEmbedding creates different embeddings for different inputs', async () => {
		const model = 'text-embedding-ada-002';
		const dimensions = 128;

		const embedding1 = await generateMockEmbedding(
			'input1',
			model,
			dimensions,
		);
		const embedding2 = await generateMockEmbedding(
			'input2',
			model,
			dimensions,
		);

		expect(embedding1).not.toStrictEqual(embedding2);
	});

	test('generateMockEmbedding creates different embeddings for different models', async () => {
		const input = 'same input';
		const dimensions = 128;

		const embedding1 = await generateMockEmbedding(
			input,
			'text-embedding-ada-002',
			dimensions,
		);
		const embedding2 = await generateMockEmbedding(
			input,
			'text-embedding-3-small',
			dimensions,
		);

		expect(embedding1).not.toStrictEqual(embedding2);
	});

	test('generateMockEmbedding respects custom dimensions', async () => {
		const input = 'test input';
		const model = 'text-embedding-ada-002';
		const dimensions = 256;

		const embedding = await generateMockEmbedding(input, model, dimensions);

		expect(embedding).toHaveLength(dimensions);
	});

	test('generateMockEmbedding uses default dimensions when not specified', async () => {
		const input = 'test input';
		const model = 'text-embedding-ada-002';

		const embedding = await generateMockEmbedding(input, model);

		expect(embedding).toHaveLength(128); // Default from environment
	});

	test('generateMockEmbeddings handles single input', async () => {
		const model = 'text-embedding-ada-002';
		const inputArray = ['single input'];

		const response = await generateMockEmbeddings(model, inputArray);

		expect(response).toBeInstanceOf(Object);
		expect(response.object).toBe('list');
		expect(response.data).toBeInstanceOf(Array);
		expect(response.data).toHaveLength(1);
		expect(response.data[0].object).toBe('embedding');
		expect(response.data[0].index).toBe(0);
		expect(response.data[0].embedding).toBeInstanceOf(Array);
		expect(response.data[0].embedding).toHaveLength(128);
		expect(response.model).toBe(model);
		expect(response.usage).toBeInstanceOf(Object);
		expect(typeof response.usage.prompt_tokens).toBe('number');
		expect(response.usage.total_tokens).toBe(response.usage.prompt_tokens);
	});

	test('generateMockEmbeddings handles multiple inputs', async () => {
		const model = 'text-embedding-ada-002';
		const inputArray = ['input1', 'input2', 'input3'];

		const response = await generateMockEmbeddings(model, inputArray);

		expect(response.data).toHaveLength(3);
		expect(response.data[0].index).toBe(0);
		expect(response.data[1].index).toBe(1);
		expect(response.data[2].index).toBe(2);

		// All embeddings should have same dimensions
		expect(response.data[0].embedding).toHaveLength(128);
		expect(response.data[1].embedding).toHaveLength(128);
		expect(response.data[2].embedding).toHaveLength(128);

		// Token usage should reflect multiple inputs
		expect(response.usage.prompt_tokens).toBeGreaterThan(1);
	});

	test('generateMockEmbeddings handles custom dimensions', async () => {
		const model = 'text-embedding-ada-002';
		const inputArray = ['test input'];
		const dimensions = 64;

		const response = await generateMockEmbeddings(
			model,
			inputArray,
			dimensions,
		);

		expect(response.data[0].embedding).toHaveLength(dimensions);
	});

	test('generateMockEmbeddings calculates reasonable token usage', async () => {
		const model = 'text-embedding-ada-002';
		const inputArray = ['This is a test sentence'];

		const response = await generateMockEmbeddings(model, inputArray);

		expect(response.usage.prompt_tokens).toBeGreaterThanOrEqual(4); // Approximately 5 words
		expect(response.usage.prompt_tokens).toBeLessThanOrEqual(8);
		expect(response.usage.total_tokens).toBe(response.usage.prompt_tokens);
	});

	test('generateMockEmbeddings is deterministic for multiple inputs', async () => {
		const model = 'text-embedding-ada-002';
		const inputArray = ['input1', 'input2'];

		const response1 = await generateMockEmbeddings(model, inputArray);
		const response2 = await generateMockEmbeddings(model, inputArray);

		expect(response1).toStrictEqual(response2);
		expect(response1.data[0].embedding).toStrictEqual(
			response2.data[0].embedding,
		);
		expect(response1.data[1].embedding).toStrictEqual(
			response2.data[1].embedding,
		);
	});
});
