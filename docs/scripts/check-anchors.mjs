// Checks that every link to a heading (`/guide/page#anchor` or `#anchor`) in the docs
// points at a heading that exists. VitePress checks the page part of a link, not the anchor.
// Run by `npm run build`. Exits 1 and lists the broken links if there are any.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The same GitHub-style slug as .vitepress/config.mts.
const slugify = (s) =>
	s
		.trim()
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
		.replace(/ /g, '-');

const pages = [];
const walk = (dir) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (
			['node_modules', '.vitepress', 'public', 'scripts'].includes(
				entry.name,
			)
		)
			continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (entry.name.endsWith('.md')) pages.push(full);
	}
};
walk(root);

// Lines outside fenced code blocks.
const proseLines = (text) => {
	const out = [];
	let fence = null;
	for (const line of text.split(/\r?\n/)) {
		const f = line.match(/^\s*(```+|~~~+)/);
		if (f) {
			if (!fence) fence = f[1];
			else if (line.trim().startsWith(fence)) fence = null;
			continue;
		}
		if (!fence) out.push(line);
	}
	return out;
};

const route = (file) =>
	'/' +
	path
		.relative(root, file)
		.replace(/\\/g, '/')
		.replace(/\.md$/, '')
		.replace(/(^|\/)index$/, '$1');

const anchors = new Map(); // route -> Set of heading ids
for (const file of pages) {
	const ids = new Set();
	const seen = new Map();
	for (const line of proseLines(fs.readFileSync(file, 'utf8'))) {
		const h = line.match(/^#{1,6} (.*?)\s*(?:\{#([\w-]+)\})?$/);
		if (!h) continue;
		let id = h[2] ?? slugify(h[1]);
		const n = seen.get(id) ?? 0;
		seen.set(id, n + 1);
		if (n) id = `${id}-${n}`;
		ids.add(id);
	}
	anchors.set(route(file), ids);
}

const broken = [];
for (const file of pages) {
	const from = route(file);
	for (const line of proseLines(fs.readFileSync(file, 'utf8'))) {
		for (const m of line.matchAll(/\]\(((?:\/[^)#\s]*)?)#([^)\s]+)\)/g)) {
			const target =
				(m[1] || from).replace(/\.md$/, '').replace(/\/$/, '') || '/';
			const ids = anchors.get(target) ?? anchors.get(target + '/');
			if (!ids || !ids.has(m[2]))
				broken.push(`${path.relative(root, file)}: ${m[1]}#${m[2]}`);
		}
	}
}

if (broken.length) {
	console.error(
		`Broken heading links (${broken.length}):\n  ` + broken.join('\n  '),
	);
	process.exit(1);
}
console.log(`Heading links OK (${pages.length} pages).`);
