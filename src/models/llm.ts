import { primaryKey } from '@mswjs/data';

export const llm = {
    id: primaryKey(Number),
    content: String,
};
