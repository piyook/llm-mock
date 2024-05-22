import 'dotenv/config';
import { http, HttpResponse } from 'msw';

const prefix = process.env?.USE_API_URL_PREFIX
    ? process.env.USE_API_URL_PREFIX + '/'
    : '';

const homePage = (apiPaths: string[]) => {
    const htmlString = `
        <html>
        <body style="background-color: #4B6A03; display: flex; flex-direction: column; justify-content: center; align-items: center; height:100%; font-family: sans-serif;">

        <div style="text-align: center; width: 80%; background-color: #E9FCBC; padding:50px; border-radius: 10px; ">
        <h1> Mock API Server Is Running</h1>

        <h3 style="color: green; font-weight: bold;padding-bottom: 50px;">http://localhost:${process.env.SERVER_PORT} </h3>
        
        <h3  style="text-align: left; color:grey">API endpoints*:</h3>
        <div>
     
        ${apiPaths.map((path) => '<h3> <a style="color: green; font-weight: bold" href="' + prefix + path + '">/' + prefix + path + '</a></h3>').join('')}

        </div>

        <p style="text-align: left; color:grey; padding-top:50px"><small>* add new api endpoints to the api folder</small></p>
   
        </div>
      
        </body>
        </html>
    `;

    return [
        http.get(`/`, () => {
            return new HttpResponse(htmlString, {
                status: 200,
                headers: {
                    'Content-Type': 'text/html',
                },
            });
        }),
    ];
};

export default homePage;
