import { factory } from '@mswjs/data';
import { gpt } from './gpt.js';

// Create database model
export const db = factory({ gpt });
