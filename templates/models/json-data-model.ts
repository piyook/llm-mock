import { primaryKey } from '@mswjs/data';

// Use primaryKey(Number) to create a unique id for each post passed into the model during creation
// Remember to change the model name from post
export const post = {
    post: {
        id: primaryKey(Number),
        userId: Number,
        title: String,
        body: String,
    },
};
