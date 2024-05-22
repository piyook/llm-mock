import { faker } from '@faker-js/faker';
import { primaryKey } from '@mswjs/data';

faker.seed();

export const user = {
    // ...with these properties and value getters.
    id: primaryKey(() => faker.string.uuid()),
    userId: () => faker.string.uuid(),
    title: () => faker.lorem.lines(1),
    body: () => faker.lorem.lines(5),
};
