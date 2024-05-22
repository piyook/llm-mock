import { faker } from '@faker-js/faker';
import { primaryKey } from '@mswjs/data';

// Set faker seed to keep same random values each start
faker.seed();

export const cat = {
    cat: {
        // ...with these properties and value getters.
        id: primaryKey(() => faker.string.uuid()),
        type: () => faker.animal.cat(),
        description: () => faker.lorem.lines(5),
        price: () => faker.commerce.price({ min: 50, max: 400 }),
    },
};
