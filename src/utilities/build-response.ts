// Define types for the response template structure and content to ensure type safety and clarity.
type ResponseTemplate = {
	default: Array<Record<string, DynamicContent>>;
};

type DynamicContent =
	| string
	| DynamicContent[]
	| { [key: string]: DynamicContent };

export const buildResponse = async (content: DynamicContent) => {
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	const responseTemplate = (await import(
		/* @vite-ignore */
		`../response-templates/${process.env.LLM_NAME ?? 'chatgpt'}_res.json`,
		{ assert: { type: 'json' } }
	)) as ResponseTemplate;

	// Use structuredClone to create a deep copy of the template
	const newResponse = structuredClone(responseTemplate.default[0]);

	// Recursive function to replace "DYNAMIC_CONTENT_HERE" with content
	const replaceDynamicContent = (obj: DynamicContent): DynamicContent => {
		if (typeof obj === 'string' && obj === 'DYNAMIC_CONTENT_HERE') {
			return content;
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => replaceDynamicContent(item));
		}

		if (typeof obj === 'object' && obj !== null) {
			const newObj: Record<string, DynamicContent> = {};
			for (const key in obj) {
				// Use Object.hasOwn to check for own properties to avoid issues with prototype properties.
				if (Object.hasOwn(obj, key)) {
					newObj[key] = replaceDynamicContent(
						obj[key as keyof typeof obj],
					);
				}
			}

			return newObj;
		}

		return obj;
	};

	return replaceDynamicContent(newResponse);
};
