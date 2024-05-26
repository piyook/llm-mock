import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultBodyType } from 'msw';
import { unescapeLeadingUnderscores } from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function logger(
    logItem: DefaultBodyType,
    state = '',
    reason = '',
    information = '',
) {
    const logFolder = `${__dirname}/../logs`;
    const logPath = path.join(logFolder, 'api_request_log.json');

    // Convert the object to a string
    const logEntry = `[{"validation_status":"${state}", "reason": "${reason}", "information": "${information}","request_time":"${new Date().toLocaleString()}"},${JSON.stringify(
        logItem,
    )
        .trim()
        .replaceAll('\\n', '')
        .replaceAll(/\s{2,}/g, ' ')}]`;

    // Append the log entry to the log file

    fs.writeFileSync(logPath, logEntry);
}
