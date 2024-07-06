export const buildResponse = async (content: string) => {
    const responseTemplate = (await import(
        `../response-templates/${process.env.LLM_NAME ?? 'chatgpt'}_res.json`,
        {
            assert: { type: 'json' },
        }
    )) as { default: JSON[] };

    const newResponse = JSON.parse(
        JSON.stringify(responseTemplate.default[0]).replace(
            /DYNAMIC_CONTENT_HERE/,
            content,
        ),
    ) as JSON;

    return newResponse;
};
