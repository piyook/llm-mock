import { db } from '../models/db.js';

/* Seed data base with RANDOM data as defined in model - 
if no input in create defaults to getter defined in model definition */

export const userSeeder = () => {
    for (let i = 0; i < 100; i++) {
        db.user.create();
    }
};
