export const buildResponse = async (content: any) => {
    const responseTemplate = (await import(
        `../response-templates/${process.env.LLM_NAME ?? 'chatgpt'}_res.json`,
        { assert: { type: 'json' } }
    )) as { default: any[] };

    const newResponse = JSON.parse(JSON.stringify(responseTemplate.default[0]));

// Recursive function to replace "DYNAMIC_CONTENT_HERE" with content
    const replaceDynamicContent = (obj: any): any => {
        if (typeof obj === 'string' && obj === 'DYNAMIC_CONTENT_HERE') {
            return content;
        }

        if (Array.isArray(obj)) {
            return obj.map(replaceDynamicContent);
        }

        if (typeof obj === 'object' && obj !== null) {
            const newObj: any = {};
            for (const key in obj) {
                newObj[key] = replaceDynamicContent(obj[key]);
            }

            return newObj;
        }

        return obj;
    };

    return replaceDynamicContent(newResponse);
};
