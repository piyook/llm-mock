import 'dotenv/config';
import { http, HttpResponse } from 'msw';

const prefix = process.env?.LLM_URL_ENDPOINT ?? '';

const homePage = (apiPaths: string[]) => {
    const htmlString = `
        <html>
        <body style="background-color: #4B6A03; display: flex; flex-direction: column; justify-content: center; align-items: center; height:100%; font-family: sans-serif;">

        <div style="text-align: center; width: 80%; background-color: #E9FCBC; padding:50px; border-radius: 10px; ">
        <h1> Mock API Server Is Running</h1>

        <h3 style="color: green; font-weight: bold;">http://localhost:${process.env.SERVER_PORT} </h3>
        <h2 style="color: white; font-weight: bold;padding-bottom: 50px;">LLM Template Engine: <span style="color: green; font-weight: bold;">${process.env?.LLM_NAME?.toUpperCase() ?? 'NONE'}</span> </h2>
        
        <h3  style="text-align: left; color:grey">LLM API endpoint:</h3>
        <div>
     
        ${apiPaths.map((path) => '<h3> <a style="color: green; font-weight: bold" href="' + prefix + '">/' + prefix + '</a></h3>').join('')}

        </div>

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
