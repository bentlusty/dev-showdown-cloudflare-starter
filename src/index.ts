import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText, jsonSchema } from 'ai';

const INTERACTION_ID_HEADER = 'X-Interaction-Id';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'GET' && url.pathname === '/') {
			const runningMessage = 'Dev Showdown Cloudflare Starter is running.';
			const message = env.DEV_SHOWDOWN_API_KEY
				? runningMessage
				: [runningMessage, 'DEV_SHOWDOWN_API_KEY is missing.'].join(
						'\n',
					);

			return new Response(message, {
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
				},
			});
		}

		if (request.method !== 'POST' || url.pathname !== '/api') {
			return new Response('Not Found', { status: 404 });
		}

		const challengeType = url.searchParams.get('challengeType');
		if (!challengeType) {
			return new Response('Missing challengeType query parameter', {
				status: 400,
			});
		}

		const interactionId = request.headers.get(INTERACTION_ID_HEADER);
		if (!interactionId) {
			return new Response(`Missing ${INTERACTION_ID_HEADER} header`, {
				status: 400,
			});
		}

		const payload = await request.json<any>();

		switch (challengeType) {
			case 'HELLO_WORLD':
				return Response.json({
					greeting: `Hello ${payload.name}`,
				});
			case 'BASIC_LLM': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You are a trivia question player. Answer the question correctly and concisely.',
					prompt: payload.question,
				});

				return Response.json({
					answer: result.text || 'N/A',
				});
			}
			case 'JSON_MODE': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}
				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateObject({
					model: workshopLlm.chatModel('deli-4'),
					system: 'Extract product data from the description into the schema. Map units and currencies to their canonical codes.',
					schema: jsonSchema({
						type: 'object',
						properties: {
							name: { type: 'string' },
							price: { type: 'number' },
							currency: {
								type: 'string',
								enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'BRL', 'CNY'],
							},
							inStock: { type: 'boolean' },
							dimensions: {
								type: 'object',
								properties: {
									length: { type: 'number' },
									width: { type: 'number' },
									height: { type: 'number' },
									unit: { type: 'string', enum: ['cm', 'in', 'mm'] },
								},
								required: ['length', 'width', 'height', 'unit'],
							},
							manufacturer: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									country: { type: 'string' },
									website: { type: 'string' },
								},
								required: ['name', 'country', 'website'],
							},
							specifications: {
								type: 'object',
								properties: {
									weight: { type: 'number' },
									weightUnit: { type: 'string', enum: ['kg', 'lb', 'g'] },
									warrantyMonths: { type: 'number' },
								},
								required: ['weight', 'weightUnit', 'warrantyMonths'],
							},
						},
						required: ['name', 'price', 'currency', 'inStock', 'dimensions', 'manufacturer', 'specifications'],
					}),
					prompt: payload.description,
				});

				return Response.json(result.object);
			}
				default:
					return new Response('Solver not found', { status: 404 });
			}
	},
	} satisfies ExportedHandler<Env>;

function createWorkshopLlm(apiKey: string, interactionId: string) {
	return createOpenAICompatible({
		name: 'dev-showdown',
		baseURL: 'https://devshowdown.com/v1',
		supportsStructuredOutputs: true,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			[INTERACTION_ID_HEADER]: interactionId,
		},
	});
}
