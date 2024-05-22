import { faker } from '@faker-js/faker';
import { primaryKey } from '@mswjs/data';

faker.seed();

export const cat = {
    // ...with these properties and value getters.
    id: primaryKey(Number),
    type: () => faker.animal.cat(),
    description: () => faker.lorem.lines(5),
    price: () => faker.commerce.price({ min: 50, max: 400 }),
};
