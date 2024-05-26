import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultBodyType } from 'msw';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function logger(logItem: DefaultBodyType) {
    const logFolder = `${__dirname}/../logs`;
    const logPath = path.join(logFolder, 'api_request_log.json');

    // Convert the object to a string
    const logEntry = `[${JSON.stringify(logItem).trim().replaceAll('\n', '')}]\n`;

    // Append the log entry to the log file

    fs.writeFile(logPath, logEntry, (err: any) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}
