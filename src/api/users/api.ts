import { db } from '../../models/db.js';

// Example of msw data auto REST handler generation
function handler(pathName: string) {
    // Need to add a prefix here for automatic REST handler generation to a specific path
    const prefix = process.env?.USE_API_URL_PREFIX
        ? '/' + process.env.USE_API_URL_PREFIX
        : '';
    return [...db.user.toHandlers('rest', prefix)];
}

export default handler;
