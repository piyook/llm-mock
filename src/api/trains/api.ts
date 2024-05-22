import { http, HttpResponse } from 'msw';

function handler(pathName: string) {
    return [
        http.get(`/${pathName}`, ({ request }) => {
            const url = new URL(request.url);
            const type = url.searchParams.get('type');
            console.log(`starting ${pathName}`);
            console.log('Item Type is', type);
            return HttpResponse.json({
                response: `this is a test response from ${pathName}`,
            });
        }),
    ];
}

export default handler;
