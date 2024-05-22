import { http, HttpResponse } from 'msw';

// Add any http handler here (get, push , delete etc., and middleware as needed)

function handler(pathName: string) {
    return [
        http.get(`/${pathName}`, ({ request }) => {
            const url = new URL(request.url);
            const type = url.searchParams.get('type');
            console.log(`starting ${pathName}`);
            console.log('Item Type is', type);
            return HttpResponse.json({
                response: `this is a GET test response from ${pathName}`,
            });
        }),
        http.post(`/${pathName}`, ({ request }) => {
            return HttpResponse.json({
                response: `this is a POST test response from ${pathName}`,
            });
        }),
    ];
}

export default handler;
