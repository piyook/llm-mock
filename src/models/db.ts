import fs from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import type { LLM } from './llm.js';

faker.seed();

type WhereId<Id> = {
	where: {
		id: {
			equals: Id;
		};
	};
};

type UpdateArgs<T, Id> = WhereId<Id> & {
	data: Partial<T>;
};

type PersistedDb = {
	version: 1;
	llm: LLM[];
};

function persistenceEnabled() {
	return process.env?.MOCK_DB_PERSIST?.toUpperCase() === 'ON';
}

function persistPath() {
	return path.resolve(
		process.cwd(),
		process.env?.MOCK_DB_PERSIST_PATH ?? '.mock-data/mock-db.json',
	);
}

function safeParsePersistedDb(raw: string): PersistedDb | null {
	try {
		const parsed = JSON.parse(raw) as PersistedDb;
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			parsed.version !== 1 ||
			!Array.isArray(parsed.llm)
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function nextNumericId<T extends { id: number }>(items: T[]) {
	let max = 0;
	for (const item of items) {
		if (item.id > max) max = item.id;
	}
	return max + 1;
}

function applyDefined<T extends Record<string, unknown>>(
	target: T,
	patch: Partial<T>,
) {
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) {
			(target as Record<string, unknown>)[key] = value;
		}
	}
}

function createModel<T extends { id: Id }, Id>(options: {
	makeId: (items: T[]) => Id;
	makeDefaults: (id: Id) => T;
	onChange?: () => void;
}) {
	let items: T[] = [];

	return {
		__unsafe_replaceAll(next: T[]) {
			items = [...next];
		},

		getAll() {
			return [...items];
		},

		create(data?: Partial<T>) {
			const id = (data?.id ?? options.makeId(items)) as Id;
			const base = options.makeDefaults(id);
			const record = { ...base, ...data, id };
			items.push(record);
			options.onChange?.();
			return record;
		},

		findFirst(args: WhereId<Id>) {
			const id = args.where.id.equals;
			return items.find((x) => x.id === id) ?? null;
		},

		update(args: UpdateArgs<T, Id>) {
			const id = args.where.id.equals;
			const item = items.find((x) => x.id === id);
			if (!item) return null;

			applyDefined(item as unknown as Record<string, unknown>, args.data);
			options.onChange?.();
			return item;
		},

		delete(args: WhereId<Id>) {
			const id = args.where.id.equals;
			const index = items.findIndex((x) => x.id === id);
			if (index === -1) return null;
			const [deleted] = items.splice(index, 1);
			options.onChange?.();
			return deleted ?? null;
		},
	};
}

let persistTimer: NodeJS.Timeout | null = null;
let persistInFlight = false;
let persistRequested = false;

function persistNow(payload: PersistedDb) {
	if (!persistenceEnabled()) return;

	const p = persistPath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf-8');
}

function persistSoon(payloadProvider: () => PersistedDb) {
	if (!persistenceEnabled()) return;

	persistRequested = true;
	if (persistTimer) return;

	persistTimer = setTimeout(() => {
		persistTimer = null;
		if (!persistRequested) return;
		if (persistInFlight) return;

		persistInFlight = true;
		persistRequested = false;
		try {
			persistNow(payloadProvider());
		} finally {
			persistInFlight = false;
			if (persistRequested) persistSoon(payloadProvider);
		}
	}, 200);
}

export const db = {
	llm: createModel<LLM, number>({
		makeId: (items) => nextNumericId(items),
		makeDefaults: (id) => ({
			id,
			content: faker.lorem.paragraphs(3),
		}),
		onChange: () => persistSoon(() => dbDump()),
	}),
};

export function dbDump(): PersistedDb {
	return {
		version: 1,
		llm: db.llm.getAll(),
	};
}

export function dbLoadFromDisk(): boolean {
	if (!persistenceEnabled()) return false;
	const p = persistPath();
	if (!fs.existsSync(p)) return false;

	const raw = fs.readFileSync(p, 'utf-8');
	const parsed = safeParsePersistedDb(raw);
	if (!parsed) return false;

	db.llm.__unsafe_replaceAll(parsed.llm);
	return true;
}

export function dbFlushToDisk(): void {
	if (!persistenceEnabled()) return;
	persistNow(dbDump());
}
