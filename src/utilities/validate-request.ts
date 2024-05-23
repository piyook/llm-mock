import { type DefaultBodyType, type StrictRequest } from 'msw';

const logRequestBody = (data: Record<string, any>) => {
    console.log('Request Body:', data);
};

export const validateRequest = async (
    request: StrictRequest<DefaultBodyType>,
) => {
    // Check if validation is disabled
    if (process.env.VALIDATE_REQUESTS !== 'ON') {
        return true;
    }

    let requestTemplate: { default: JSON[] } | undefined;

    // Load request template if one exists otherwise fail validation
    try {
        requestTemplate = (await import(
            `../request-templates/${process.env.LLM_NAME ?? 'chatgpt'}_chat.json`,
            {
                assert: { type: 'json' },
            }
        )) as { default: JSON[] };
    } catch {
        console.log('INTERNAL ERROR: No request template found');
        return false;
    }

    // Check request has a body and it is an object
    if (typeof request.body !== 'object' || request.body === null) {
        return false;
    }

    // Check request has basic keys required for a request
    return request
        .json()
        .then((data) => {
            const requiredKeys = Object.keys(requestTemplate.default[0]);

            if (typeof data !== 'object' || data === null) {
                return false;
            }

            const requestKeys = Object.keys(data);

            if (requiredKeys.length !== requestKeys.length) {
                logRequestBody(data);
                return false;
            }

            for (const key of requiredKeys) {
                if (!requestKeys.includes(key)) {
                    logRequestBody(data);
                    return false;
                }
            }

            return true;
        })
        .catch(() => {
            console.log('UNEXPECTED ERROR BEING CAUGHT');
            return false;
        });
};
