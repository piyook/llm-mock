import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitepress';

// The site is served from https://piyook.github.io/llm-mock/ for now.
// For a custom domain such as docs.llmock.dev, set DOCS_BASE=/ (or change the default).
const base = process.env.DOCS_BASE ?? '/llm-mock/';
const repo = 'https://github.com/piyook/llm-mock';

// GitHub's heading ids, so the README's #anchors carry over to the pages unchanged.
const slugify = (s: string) =>
	s
		.trim()
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
		.replace(/ /g, '-');

export default defineConfig({
	title: 'LLMock',
	description:
		'A configurable mock LLM API server for testing and development',
	base,
	cleanUrls: true,
	lastUpdated: true,
	head: [
		[
			'link',
			{ rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` },
		],
		['meta', { name: 'theme-color', content: '#4f8a8b' }],
	],
	markdown: {
		anchor: { slugify },
	},
	// llms.txt is linked from the home page and copied to the site root at build time.
	ignoreDeadLinks: [/\/llms\.txt$/],
	buildEnd(siteConfig) {
		fs.copyFileSync(
			path.resolve(siteConfig.root, '..', 'llms.txt'),
			path.join(siteConfig.outDir, 'llms.txt'),
		);
	},
	themeConfig: {
		logo: '/logo.svg',
		nav: [
			{
				text: 'Get started',
				link: '/guide/getting-started',
				activeMatch: '/guide/',
			},
			{
				text: 'Reference',
				link: '/reference/cli',
				activeMatch: '/reference/',
			},
			{ text: 'Changelog', link: '/changelog' },
			{ text: 'npm', link: 'https://www.npmjs.com/package/llmock' },
		],
		// Ordered as a reader meets it: start, then guides by task, then the detail.
		// The order also sets each page's Previous / Next links.
		sidebar: [
			{
				text: 'Start here',
				items: [
					{ text: 'Getting started', link: '/guide/getting-started' },
					{ text: 'Installation', link: '/guide/installation' },
					{ text: 'Configuration', link: '/guide/configuration' },
				],
			},
			{
				text: 'Control the replies',
				items: [
					{ text: 'Response rules', link: '/guide/response-rules' },
					{
						text: 'Recording real replies',
						link: '/guide/recording',
					},
					{ text: 'Streaming', link: '/guide/streaming' },
					{
						text: 'Delays and chaos mode',
						link: '/guide/delay-and-chaos',
					},
				],
			},
			{
				text: 'Connect your app',
				items: [
					{ text: 'Integration', link: '/guide/integration' },
					{ text: 'LLM providers', link: '/guide/providers' },
					{
						text: 'Using LLMock in tests',
						link: '/guide/testing-from-code',
					},
					{ text: 'Using with LLMSpy', link: '/guide/llmspy' },
					{ text: 'Docker', link: '/guide/docker' },
				],
			},
			{
				text: 'See what happened',
				items: [
					{
						text: 'Dashboard and logging',
						link: '/guide/dashboard-and-logging',
					},
				],
			},
			{
				text: 'Reference',
				items: [
					{ text: 'CLI', link: '/reference/cli' },
					{ text: 'Admin API', link: '/reference/admin-api' },
				],
			},
			{
				text: 'Walkthroughs',
				collapsed: true,
				items: [
					{
						text: 'Testing streaming by hand',
						link: '/guide/testing/streaming',
					},
					{
						text: 'Testing embeddings by hand',
						link: '/guide/testing/embeddings',
					},
				],
			},
			{
				text: 'Help',
				items: [
					{ text: 'Troubleshooting', link: '/troubleshooting' },
					{ text: 'Changelog', link: '/changelog' },
				],
			},
		],
		socialLinks: [{ icon: 'github', link: repo }],
		search: { provider: 'local' },
		outline: { level: [2, 3] },
		editLink: {
			pattern: `${repo}/edit/dev/docs/:path`,
			text: 'Edit this page on GitHub',
		},
		footer: {
			message: 'Released under the MIT License.',
		},
	},
});
