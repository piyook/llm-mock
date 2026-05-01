import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define types for the response template structure and content to ensure type safety and clarity.
type ResponseTemplate = {
	default: Array<Record<string, DynamicContent>>;
};

type DynamicContent =
	| string
	| DynamicContent[]
	| { [key: string]: DynamicContent };

export const buildResponse = async (content: DynamicContent) => {
	const llmName = process.env.LLM_NAME ?? 'openai';
	const templateFileName = `${llmName}_res.json`;

	// Try to load response template from current working directory first
	const cwdTemplatePath = resolve(
		process.cwd(),
		'response-templates',
		templateFileName,
	);
	const srcTemplatePath = resolve(
		__dirname,
		'../response-templates',
		templateFileName,
	);

	let responseTemplate: ResponseTemplate;

	try {
		// First try current working directory
		if (existsSync(cwdTemplatePath)) {
			const fs = await import('fs');
			const templateData = fs.readFileSync(cwdTemplatePath, 'utf8');
			responseTemplate = { default: JSON.parse(templateData) };
		} else {
			// Fallback to src directory
			// eslint-disable-next-line @typescript-eslint/no-implied-eval
			responseTemplate = (await import(
				/* @vite-ignore */
				`../response-templates/${templateFileName}`,
				{ assert: { type: 'json' } }
			)) as ResponseTemplate;
		}
	} catch {
		console.log('INTERNAL ERROR: No response template found');
		console.log(`Checked: ${cwdTemplatePath} and ${srcTemplatePath}`);
		throw new Error(
			`Response template ${templateFileName} not found. Add it to response-templates folder in current directory or src/response-templates`,
		);
	}

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
