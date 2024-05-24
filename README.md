# Local Mock GPT API Framework

## Purpose

The purpose of this project is to provide a quick-to-set-up standalone local mock API framework to develop API endpoints running on localhost.

This can be used for testing API code and logic before deploying to live servers or quickly producing API endpoints for rapid prototyping for developing frontend clients for web or mobile.

The project is built using MSW and can be run directly on a local machine or in docker containers.

## Set-up

Clone the repo or use the template button directly in GitHub to set-up a new repo using this one as a template.

Install dependencies.

#### Git LFS

You can use git LFS to handle large files such as database files or image files.

Use LFS to track large database files by running the command below

```
git lfs track --filename src/data/data.json
```

To track other types of files such as images or videos run the command below with the desired file type

```
git lfs track "*.png"
```

## Starting

#### Docker

To start in docker run

```
npm start
```

Your apis will be available on localhost:8000/api by default but this can be customised - see later.

To stop and remove containers run

```
npm stop
```

To rebuild containers run :

```
npm run rebuild
```

To destroy everything and then rebuild the project (removing node modules, caches and all docker resources) run:

```
npm run nuke
```

#### Local Machine

To run directly on your local machine not using docker

```
npm run dev
```

## Using the Mock API Framework

To create a new api path (E.g api/users)

### 1. Create a **new folder** within the api folder the api path name you want:

```
mkdir src/api/users
```

### 2. Create an **api.ts** file in this new folder and add handler logic here - see https://github.com/mswjs/msw for information on writing handlers.

Also take a look at the example handlers in the api folder.

The mock api framework uses the msw-data utility - see https://github.com/mswjs/data and a full rest or graphql api can be automatically set-up from this without having to define each handler using the format below

```
...db.user.toHandlers('rest')
```

### 3. Create a database

Database models are held in **/models** directory.

a. Create new models in this directory as required - see the users.ts and posts.ts examples.

b. Import the new model into the db.ts file and add to the factory function - https://github.com/mswjs/data for more details

### 4. Seeding the database

#### a. manually adding data

Data can be manually added / amended via POST/PUT requests to the relevant REST endpoint. This data wont persist and will be lost when the server is restarted.

#### b. seed database with fake data.

It is possible to seed the database with fake data using seeder functions and faker.js. See the seeders/user-seeder.ts and models/user.ts example.

Database seeders are located in the seeders folder.

**Note**: New seeders should be created here and added to the index.ts file in the same folder in order to be automatically imported and executed on server start.
This data will be different each time the server is started and the seeders re-run.

#### c. populate the database with existing data

You can create a data.json file in the /data folder and import this to seed the database with data that will persist and be the same each time the server is started.

See the seeders/post-seeder.ts and models/post.ts example

### 5. Making Http Requests

Given the "user" model definition above, the following request handlers are generated and connected to the respective database operations:

    GET /users/:id (where "id" is your model's primary key), returns a user by ID;
    GET /users, returns all users (supports pagination);
    POST /users, creates a new user;
    PUT /users/:id, updates an existing user by ID;
    DELETE /users/:id, deletes an existing user by ID;

The "/user" part of the route is derived from your model name. For example, if you had a "post" model defined in your factory, then the generated handlers would be /posts, /posts/:id, etc.

### 6. Middleware

For **custom handlers** can contain 'middleware' code defined in an individual handler for each route and http header verb.

See the cat api for examples of custom handlers getting information from the database and bikes and trains apis for examples of simple 'middleware' added to a custom route.

Url parameters can be extracted using

```
url.searchParams.get('type')
```

where type is a url parameter (/api/bikes/?type=KawasakiNinja). This can then be used in the middleware code as required.

### 7. Available endpoints

Available endpoints are listed at the url root

```
http://localhost:8000
```

### 8. Templates

The templates directory contains useful templates for different type of handlers, models and seeders

## Customisation

### Change api url prefix

By default the api paths with be prefixed with "api/" this can be modified with the
LLM_URL_ENDPOINT environment variable in the .env file.

By setting this to blank then the path will just be the api name E.g localhost:8000/users

You can set this to any value E.g

```
LLM_URL_ENDPOINT=things
```

will give localhost:8000/things/users

### Change port number

By default this is set to 8000 but can be changed by setting the SERVER_PORT in the .env file:

```
SERVER_PORT=1234
```

### Return stored responses

Set the following environment variable to 'stored' to use responses stored int the data/data.json file:

```
MOCK_LLM_RESPONSE_TYPE=stored
```

The responses increment for each http request and restart as the beginning once all have been used.

### Return randomly generated lorem ipsum responses

Set the following environment variable to 'lorem' to use responses stored in the data/data.json file:

```
MOCK_LLM_RESPONSE_TYPE=lorem
```

A random number of sentences are generated in the response and the maximum sentence number can be set with:

```
MAX_LOREM_PARAS=8
```

### Validate Requests to the LLM are in the correct format

-   add a request template for the LLM of choice
-   set env var to ON

### Debugging

You can toggle the detailed debug mode that shows more detail on each request and response by setting:

```
DEBUG=*
```

set to FALSE to remove debugging details
