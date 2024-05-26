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
            logs =
                '{"message": "No logs found", "solution": "Set VALIDATE_REQUESTS env var to ON. Restart the server then retry the request"}';
        }

        return logs;
    }

    const htmlString = `
        <html>
        <header> 
        <title>API Request Log</title>
        </header>
            <body style="margin: 0px; background-color: #00200B; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height:100vh; font-family: sans-serif;">
            <h2 style="color:white">Last POST Request Made</h2>
            <h5 style="color:indianred">Set both LOG_REQUESTS and VALIDATE_REQUESTS env vars to 'ON' to validate and log http POST requests</h5>
            <h3 style="color:white">File can be viewed in /src/logs folder in container or local machine</h3>
<div class="json-container" style="width: 100%; padding:20px; box-sizing: border-box;">
${prettyPrintJson.toHtml(JSON.parse(readLogs()), { indent: 4, lineNumbers: true })}
</div>

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
       

/* Layout */
.json-container           { font-family: menlo, consolas, monospace; font-style: normal; font-weight: bold; line-height: 1.4em; font-size: 0.9rem; transition: background-color 400ms; display: block }
a.json-link               { text-decoration: none; border-bottom: 1px solid; outline: none; }
a.json-link:hover         { background-color: transparent; outline: none; }
ol.json-lines             { white-space: normal; padding-inline-start: 3em; margin: 0px; max-width:100%; overflow: hidden;}
ol.json-lines >li         { white-space: pre-wrap; text-indent: 0.7em; line-height: 1.5em; padding: 0px;}
ol.json-lines >li::marker { font-family: system-ui, sans-serif; font-weight: normal; }
.json-key, .json-string, .json-number, .json-boolean, .json-null, .json-mark, a.json-link, ol.json-lines >li { transition: all 400ms; }


/* Dark Mode */
 .json-container                   { background-color: #00200B; }
 .json-key                         { color: indianred; }
 .json-string                      { color: khaki}
 .json-number                      { color: deepskyblue; }
 .json-boolean                     { color: mediumseagreen;}
 .json-null                        { color: darkorange; }
 .json-mark                        { color: silver; }
 a.json-link                       { color: mediumorchid; }
 a.json-link:visited               { color: slategray; }
 a.json-link:hover                 { color: violet; }
 a.json-link:active                { color: slategray; }
 ol.json-lines >li::marker         { color: silver; }
 ol.json-lines >li:nth-child(odd)  { background-color: #293829; }
 ol.json-lines >li:nth-child(even) { background-color: #354135; }
 ol.json-lines >li:hover           { background-color: dimgray; }
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
