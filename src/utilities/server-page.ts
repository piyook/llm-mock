import 'dotenv/config';
import { http, HttpResponse } from 'msw';

const prefix = process.env?.LLM_URL_ENDPOINT ?? '';

const homePage = (apiPaths: string[]) => {
    const htmlString = `
        <html>
        <body style="background-color: #4B6A03; display: flex; flex-direction: column; justify-content: center; align-items: center; height:100%; font-family: sans-serif;">

        <div style="text-align: center; width: 80%; background-color: #E9FCBC; padding:50px; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <h1 style="padding-bottom: 50px;"> Mock API Server Is <span style="color: green; font-weight: bold;">Running</span></h1>

    <div style="text-align:left;width:80%; ">
        <h3 style="color: white; font-weight: bold;">Mock Server Localhost Port: <span style="color: green; font-weight: bold;">${process.env?.SERVER_PORT?.toUpperCase() ?? 'NONE'}</span> </h3>
        <h3 style="color: white; font-weight: bold;">Mock url: <span style="color: green; font-weight: bold;">${process.env?.LLM_URL_ENDPOINT?.toUpperCase() ?? 'NONE'}</span> </h3>
        <h3 style="color: white; font-weight: bold;">LLM Mock Engine: <span style="color: green; font-weight: bold;">${process.env?.LLM_NAME?.toUpperCase() ?? 'NONE'}</span> </h3>
        <h3 style="color: white; font-weight: bold;">LLM Mock Response Type: <span style="color: green; font-weight: bold;">${process.env.MOCK_LLM_RESPONSE_TYPE?.toUpperCase() ?? 'NONE'}</span> </h3>
        <h3 style="color: white; font-weight: bold;padding-bottom: 50px;">Debug Mode: <span style="color: green; font-weight: bold;">${process.env.DEBUG === '*' ? 'ON' : 'OFF'}</span> </h3>
        <h3  style="text-align: left;">LLM API POST endpoint: ${apiPaths.map((path) => '<a style="color: green; font-weight: bold" href="' + prefix + '">/' + prefix + '</a>').join('')}</h3>
        </div>
        
        <div>
     
        

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
