import { db } from '../models/db.js';

export const catSeeder = () => {
    for (let i = 1; i < 100; i++) {
        db.cat.create({
            id: i,
        });
    }
};
