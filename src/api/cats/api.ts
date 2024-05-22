import { http, HttpResponse } from 'msw';
import { db } from '../../models/db.js';

function handler(pathName: string) {
    return [
        http.get(`/${pathName}`, ({ request }) => {
            const url = new URL(request.url);
            const type = url.searchParams.get('type');
            console.log(`starting ${pathName}`);
            console.log('Item Type is', type);

            const cats = db.cat.getAll();
            return HttpResponse.json(cats);
        }),
    ];
}

export default handler;
