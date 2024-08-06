![GitHub Release](https://img.shields.io/github/v/release/piyook/llm-mock)
![tests workflow](https://github.com/piyook/llm-mock/actions/workflows/tests.yaml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Local Mock LLM API Framework

## Purpose

The purpose of this project is to provide a quick-to-set-up standalone local mock LLM API framework running on localhost for developing with Large Language Models such as Chat-GPT.

This can be used for testing API code and logic before deploying to live servers, quickly producing API endpoints for rapid prototyping for developing frontend clients for web or mobile or working off-line when there is no internet connection. Using a local mock is quicker and cheaper (i.e FREE) than using commerical LLM's for initial set-up work and can be convenient when there is no internet connection available to access LLM endpoints.

The project is built using MSW and can be run directly on a local machine or in docker containers. It is further adapted from the general mock-api framework here: https://github.com/piyook/mock-api-framework-template

## Set-up

Clone the repo & install dependencies.

## Starting

#### Docker

To start in docker run

```
npm start
```

Your apis will be available on localhost:8001/api by default but this can be customised - see later.

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

## Using the Mock LLM Framework

![LLM Mock Server Page](image.png)

### Available endpoints

Available endpoints are listed at the url root

```js
http://localhost:8001
```

### Change api url prefix

By default the api paths with be prefixed with "api/" this can be modified with the LLM_URL_ENDPOINT environment variable in the .env file.

By setting this to blank then the path will just be the api name E.g localhost:8001/users

You can set this to any value E.g

```js
LLM_URL_ENDPOINT = things;
```

will give

```js
localhost: 8001 / things / users;
```

This can be used to match the expected path for the LLM (E.g for chatGPT it is 'chatgpt/chat/completions')

### Change port number

By default this is set to 8000 but can be changed by setting the SERVER_PORT in the .env file:

```
SERVER_PORT=1234
```

### Return Mock Responses

The LLM response can be set to return random Lorem Ipsum or a random stored response.

![LLM Mock Lorem Response](image2.png)

Set the following environment variable to 'stored' to use responses stored int the data/data.json file:

```js
MOCK_LLM_RESPONSE_TYPE = stored;
```

![LLM Mock Stored Response](image3.png)

The responses are randomly picked and change for each http request.

### Return randomly generated lorem ipsum responses

Set the following environment variable to 'lorem' to use responses stored in the data/data.json file:

```js
MOCK_LLM_RESPONSE_TYPE = lorem;
```

A random number of sentences are generated in the response and the maximum sentence number can be set with:

```js
MAX_LOREM_PARAS = 8;
```

### Validate Requests to the LLM are in the correct format

-   add a request template for the LLM of choice
-   set env var to ON

This will provide error messages on why the request did not meet the required LLM API request format.

### Debugging

You can toggle the detailed debug mode that shows more detail on each request in the terminal and response by setting:

```
DEBUG=*
```

set to FALSE to remove debugging details

### Validating Requests

Requests can be validated against the template in the request-templates folder.  
Set the VALIDATE_REQUESTS env var to true to enable this.
Requests that don't pass the validation will result in an error.

### Logging Requests to the LLM Mock

The last request made to the mock can be viewed from

```js
localhost: 8001 / logs;
```

This page provides information sent to the LLM Mock and is useful during development.

To use this set the LOG_REQUESTS AND VALIDATE_REQUESTS to TRUE in the .env file.

## Using the LLM Mock In Practice

You will need to redirect all your LLM traffic to the mock llm endpoint. For example if using chatgpt and langchain:

set the endpoint to the following:

```js
LLM_URL_ENDPOINT = chatgpt / chat / completions;
```

this provides an endpoint that mimics the chatgpt endpoint on :

```js
http://localhost:8001/chatgpt/chat/completions

```

In your LLM client llm-response code you can change the chatGPT baseURL if a DEV_MODE flag is set to 'on'

```js
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

const chatModel = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-3.5-turbo',
    configuration:
        process.env.DEV_MODE === 'true'
            ? {
                  baseURL: process.env.DEV_BASE_URL,
              }
            : {},
});
```

For example

```js
DEV_MODE=true
DEV_BASE_URL=http://localhost:8001/chatgpt
```

note that you will also need to prevent requests to the real LLM for embeddings - you can do this in langchain using something like

```s
import { FakeEmbeddings } from 'langchain/embeddings/fake';


let embeddings;

    if (process.env.DEV_MODE === 'true') {
        embeddings = new FakeEmbeddings();
        console.log(
            `WARNING: DEV MODE IS ON. Using fake embeddings and localhost mock server on ${process.env?.DEV_BASE_URL}`,
        );
    } else {
        embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
    }

```

and then continue to use the code as for normal requests. Setting Dev mode to false will enable real requests to be made.

Its often useful when developing chatbots and assistants to get back a variety of responses. You can set the LLM Mock env vars to use either random lorem ipsum (up to a maximum number of sentences )

```js
MOCK_LLM_RESPONSE_TYPE = lorem;
MAX_LOREM_PARAS = 8;
```

https://github.com/user-attachments/assets/d36651ac-d7fa-41ad-b8d8-cd23812ae45a

or use stored responses that are randomly provided by setting

```js
MOCK_LLM_RESPONSE_TYPE = stored;
```

then just add required responses to the src/data/data.json file.

https://github.com/user-attachments/assets/86115f16-63d7-49de-af32-c6f9c2bec7cf

# Using Different LLMs

Any LLM model can be set up by adding a JSON request-template into the request-templates folder for the shape of the expected request TO the LLM endpoint. This file name must have the format <LLM_NAME>\_req.json

A JSON response-template is also added to the response-templates folder with the expected shape of the response object, replacing any expected content with 'DYNAMIC_CONTENT_HERE'. The file name must have the format <LLM_NAME>\_res.json

Example:

```js
"message": {
                    "role": "assistant",
                    "content": "DYNAMIC_CONTENT_HERE"
                },
```

This is where lorem or stored responses will be injected into the response object.

Lastly the .env file will need to be updated for the model name (which has to be the same as <LLM_NAME>)

For example to use Google Gemini (another example included in this repo) set the variables below the .env

```js
LLM_URL_ENDPOINT=models/gemini-pro:generateContent
LLM_NAME=gemini
VALIDATE_REQUESTS=ON
```

Gemini content is then available for GET and POST requests on

```js
http://localhost:8001/models/gemini-pro:generateContent.
```

Any validation issues with requests from the frontend can be viewed on localhost:8001/logs

LLM framework that supports the new model (such as LangChain) can then be updated to use this endpoint (as for the chatGPT example).
