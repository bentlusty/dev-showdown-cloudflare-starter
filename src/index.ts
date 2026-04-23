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
					system: [
						'Extract product data from the description into a JSON object.',
						'ALL fields are required — never omit any:',
						'- name (string): full product name including model/code',
						'- price (number)',
						'- currency (string): ISO code (USD, EUR, GBP, JPY, CAD, AUD, SEK, NOK, DKK, BRL, CNY)',
						'- inStock (boolean)',
						'- dimensions: { length, width, height (numbers), unit ("cm" | "in" | "mm") }',
						'- manufacturer: { name, country, website (strings) }',
						'- specifications: { weight (number), weightUnit ("kg" | "lb" | "g"), warrantyMonths (number) }',
						'Convert units and currencies to the canonical codes listed above.',
					].join('\n'),
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
			case 'BASIC_TOOL_CALL': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}
				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const city = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'Respond with only the city name from the question. No other words, no punctuation.',
					prompt: payload.question,
				});

				const weatherResponse = await fetch('https://devshowdown.com/api/weather', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						[INTERACTION_ID_HEADER]: interactionId,
					},
					body: JSON.stringify({ city: city.text }),
				});
				const weather = await weatherResponse.json<{ temperature: number | string }>();

				return Response.json({
					answer: `The weather in ${city.text} is currently ${weather.temperature}.`,
				});
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
