import { factory } from '@mswjs/data';
import { cat } from './cat.js';
import { user } from './user.js';
import { post } from './post.js';

// Create database model
export const db = factory({ cat, user, post });
