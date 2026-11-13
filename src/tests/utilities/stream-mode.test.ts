import { describe, expect, test } from 'vitest';
import { shouldStream } from '../../utilities/stream-mode.js';

describe('shouldStream', () => {
	describe('claude preset (per-request)', () => {
		test('streams when the request body sets stream: true', () => {
			expect(shouldStream('claude', { stream: true }, 'false')).toBe(
				true,
			);
		});

		test('returns static JSON when stream is false or absent', () => {
			expect(shouldStream('claude', { stream: false }, 'true')).toBe(
				false,
			);
			expect(shouldStream('claude', { messages: [] }, 'true')).toBe(
				false,
			);
		});

		test('ignores non-boolean stream values', () => {
			expect(shouldStream('claude', { stream: 'true' }, 'true')).toBe(
				false,
			);
		});

		test('returns static JSON for a missing or non-object body (GET)', () => {
			expect(shouldStream('claude', undefined, 'true')).toBe(false);
			expect(shouldStream('claude', null, 'true')).toBe(false);
			expect(shouldStream('claude', 'stream', 'true')).toBe(false);
		});
	});

	describe('other presets (server-wide STREAM)', () => {
		test.each(['openai', 'gemini', undefined])(
			'follows STREAM=true for %s',
			(name) => {
				expect(shouldStream(name, {}, 'true')).toBe(true);
				expect(shouldStream(name, {}, 'TRUE')).toBe(true);
			},
		);

		test.each(['openai', 'gemini', undefined])(
			'follows STREAM=false or unset for %s',
			(name) => {
				expect(shouldStream(name, {}, 'false')).toBe(false);
				expect(shouldStream(name, {}, undefined)).toBe(false);
			},
		);

		test('gemini ignores the request body stream field', () => {
			expect(shouldStream('gemini', { stream: true }, 'false')).toBe(
				false,
			);
			expect(shouldStream('gemini', { stream: false }, 'true')).toBe(
				true,
			);
		});
	});

	describe('openai preset (request first, then STREAM)', () => {
		test('stream: true in the request streams on a non-streaming preset', () => {
			expect(shouldStream('openai', { stream: true }, 'false')).toBe(
				true,
			);
			expect(shouldStream('openai', { stream: true }, undefined)).toBe(
				true,
			);
		});

		test('stream: false in the request gets JSON on a streaming preset', () => {
			expect(shouldStream('openai', { stream: false }, 'true')).toBe(
				false,
			);
		});

		test('a request without a boolean stream follows STREAM', () => {
			expect(shouldStream('openai', { messages: [] }, 'true')).toBe(true);
			expect(shouldStream('openai', { messages: [] }, 'false')).toBe(
				false,
			);
			expect(shouldStream('openai', { stream: 'true' }, 'false')).toBe(
				false,
			);
			expect(shouldStream('openai', { stream: null }, 'true')).toBe(true);
		});

		test('a GET (no body) follows STREAM', () => {
			expect(shouldStream('openai', undefined, 'true')).toBe(true);
			expect(shouldStream('openai', undefined, 'false')).toBe(false);
		});
	});
});
