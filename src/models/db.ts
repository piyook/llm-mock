import { factory } from '@mswjs/data';
import { llm } from './llm.js';

// Create database model
export const db = factory({ llm });
