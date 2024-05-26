import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { http, HttpResponse } from 'msw';
import { prettyPrintJson, FormatOptions } from 'pretty-print-json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createHtml = () => {
    function readLogs() {
        const logFolder = `${__dirname}/../logs`;
        const logPath = path.join(logFolder, 'api_request_log.json');
        let logs = '';
        // Append the log entry to the log file
        try {
            logs = fs.readFileSync(logPath, 'utf8');
        } catch {
            logs = '{"message": "No logs found"}';
        }

        return logs;
    }

    const htmlString = `
        <html>
        <header> 
        <link rel=stylesheet href=https://cdn.jsdelivr.net/npm/pretty-print-json@3.0/dist/css/pretty-print-json.css>
        </header>
            <body style="margin: 0px; background-color: #00200B; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height:100vh; font-family: sans-serif;">
            <h2 style="color:white">Last POST Request Made</h2>
            <h3 style="color:white">File can be viewed in /src/logs folder in container or local machine</h3>
<div class="json-container" style="width: 100%; padding:20px; box-sizing: border-box;">
${prettyPrintJson.toHtml(JSON.parse(readLogs()), { indent: 4, lineNumbers: true })}
</div>

<script src=https://cdn.jsdelivr.net/npm/pretty-print-json@3.0/dist/pretty-print-json.min.js></script>
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
            .logs {
                max-width: 400px;
            }
            </style>
        </html>
    `;

    return htmlString;
};

const logPage = () => {
    return [
        http.get(`/logs`, () => {
            return new HttpResponse(createHtml(), {
                status: 200,
                headers: {
                    'Content-Type': 'text/html',
                },
            });
        }),
    ];
};

export default logPage;
