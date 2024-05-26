import 'dotenv/config';
import { http, HttpResponse } from 'msw';

const prefix = process.env?.LLM_URL_ENDPOINT ?? '';

const homePage = (apiPaths: string[]) => {
    const htmlString = `
        <html>
            <body style="margin: 0px; background-color: #00200B; display: flex; flex-direction: column; justify-content: center; align-items: center; height:100vh; font-family: sans-serif;">

            <div style="text-align: center; width: 80%; background-color: #00200B; padding:50px; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; color:white">
                <h1 style="padding-bottom: 50px;"> Mock LLM Server: <span class="highlight">Running</span></h1>

                <div style="text-align:left;width:clamp(650px, 800px, 90%)); ">
                <h3 class="info">Server Address: <span class="highlight">localhost</span> </h3>
                <h3 class="info">Server Port: <span class="highlight">${process.env?.SERVER_PORT?.toUpperCase() ?? 'NONE'}</span> </h3>
                <h3 class="info">Server URL: <span class="highlight">${process.env?.LLM_URL_ENDPOINT?.toUpperCase() ?? 'NONE'}</span> </h3>
                <h3 class="info">Mocked LLM: <span class="highlight">${process.env?.LLM_NAME?.toUpperCase() ?? 'NONE'}</span> </h3>
                <h3 class="info">Response Type: <span class="highlight">${process.env.MOCK_LLM_RESPONSE_TYPE?.toUpperCase() ?? 'NONE'}</span> </h3>
                <h3 class="info">${process.env.MOCK_LLM_RESPONSE_TYPE === 'lorem' ? `   Maximum sentences: <span class="highlight"> ${process.env?.MAX_LOREM_PARAS} </span>` : ''}</h3>
                <h3 class="info">LLM Request Validation: <span class="highlight">${process.env?.VALIDATE_REQUESTS?.toUpperCase() ?? 'NONE'}</span> </h3>
                <h3 class="info">Http Request Log: <span class="highlight">${process.env?.LOG_REQUESTS?.toUpperCase() ?? 'NONE'}</span> </h3>
                <h3 class="info">View Logs url: <a class="highlight" href="/logs">localhost:${process.env?.SERVER_PORT}/logs</a> </h3>
                <h3 class="info">Debug Mode: <span class="highlight">${process.env.DEBUG === '*' ? 'ON' : 'OFF'}</span> </h3>
            
                <h3  class="info">API endpoint (GET & POST): ${apiPaths.map((path) => '<a class="highlight" href="' + prefix + '">/' + prefix + '</a>').join('')}</h3>
                </div>
            <div>
        
            
            <p style="color:grey;font-style:italic; margin-top:70px;">modify settings in .env file and restart server</p>
    
            </body>
            <style> 
            
            .highlight { 
                background-color:#28831C;
                padding:5px 10px 5px 10px;
                border-radius: 5px;
                font-weight: bold;
                color: white;
                margin-left: 15px;
                border: 3px white solid;
            }

            .info {
                font-weight: bold;
                padding: 10px 0px 10px 0px;
            }
            </style>
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
