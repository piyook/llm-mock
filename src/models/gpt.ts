import { primaryKey } from '@mswjs/data';

export const gpt = {
    id: primaryKey(Number),
    content: String,
};
