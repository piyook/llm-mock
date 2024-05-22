// Custom handler with middleware
// Copy and save as api.ts in the api path folder in your project

import { http, HttpResponse } from 'msw';
// import { db } from '../src/models/db.js';
function handler(pathName: string) {
    return [
        // Add any http handler here (get, push , delete etc., and middleware as needed)
        http.get(`/${pathName}`, ({ request }) => {
            // GET action code here
            const url = new URL(request.url);
            // get url parameters using url.searchParams.get('paramName')
            const type = url.searchParams.get('type');

            // Get data from db using db.[modelName].getAll()
            // E.g const cats = db.cat.getAll();
            // E.g return HttpResponse.json(cats);

            // Middleware code here if needed and can return json, text or other responses
            return HttpResponse.json({
                response: `this is a GET test response from ${pathName}`,
            });
        }),
        // Repeat process for POST, PUT and DELETE
        http.post(`/${pathName}`, ({ request }) => {
            // POST action code here using db.[modelName].create({data})
            return HttpResponse.json({
                response: `this is a POST test response from ${pathName}`,
            });
        }),
        http.put(`/${pathName}`, ({ request }) => {
            // PUT action code here using db.[modelName].update({data})
            return HttpResponse.json({
                response: `this is a PUT test response from ${pathName}`,
            });
        }),
        http.delete(`/${pathName}`, ({ request }) => {
            // DELETE action code here using db.[modelName].delete({data})
            return HttpResponse.json({
                response: `this is a DELETE test response from ${pathName}`,
            });
        }),
    ];
}

export default handler;
