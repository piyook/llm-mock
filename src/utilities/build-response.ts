export const buildResponse = async (content: string) => {
    const chatTemplate = (await import(
        `../response-templates/${process.env.LLM_NAME ?? 'chatgpt'}_chat.json`,
        {
            assert: { type: 'json' },
        }
    )) as { default: JSON[] };

    const newResponse = JSON.parse(
        JSON.stringify(chatTemplate.default[0]).replace(
            /DYNAMIC_CONTENT_HERE/,
            content,
        ),
    ) as JSON;

    return newResponse;
};
