/* eslint-disable import/order  */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { createRequire } from 'node:module';
import { db } from '../models/db.js';
import { type Llm } from '../types.js';

const require = createRequire(import.meta.url);
const llmData: Llm[] = require('../data/data.json');

// With this method we are seeding the database with persisted data from data/data.json rather than using faker data
export const gptSeeder = () => {
    for (const item of llmData) {
        db.llm.create({
            id: item.id,
            content: item.content,
        });
    }
};
