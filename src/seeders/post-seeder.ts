/* eslint-disable import/order  */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { createRequire } from 'node:module';
import { db } from '../models/db.js';
import { type Post } from '../types.js';

const require = createRequire(import.meta.url);
const postData: Post[] = require('../data/data.json');

// With this method we are seeding the database with persisted data from data/data.json rather than using faker data
export const postSeeder = () => {
    for (const post of postData) {
        db.post.create({
            id: post.id,
            userId: post.userId,
            title: post.title,
            body: post.body,
        });
    }
};
