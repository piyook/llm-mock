/* eslint-disable import/order  */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { createRequire } from 'node:module';
import { db } from '../../src/models/db.js';
// Add own types for new model here

// Never start at 0 - this will break the primary key
export const catSeeder = () => {
    for (let i = 1; i < 100; i++) {
        db.cat.create({
            id: i,
        });
    }
};
