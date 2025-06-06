import {
	CANVAS_PERSONALIZE_SLOT,
	CANVAS_PERSONALIZE_TYPE,
	CANVAS_TEST_TYPE,
	ComponentParameter,
	RouteGetResponse,
	RouteGetResponseComposition,
	mapSlotToPersonalizedVariations,
	mapSlotToTestVariations,
} from '@uniformdev/canvas';
import { Context, ManifestV2, CookieTransitionDataStore, CookieTransitionDataStoreOptions } from '@uniformdev/context';
import manifest from './context-manifest.json';
import { walkNodeTree } from '@uniformdev/canvas';
import { CANVAS_TEST_SLOT } from '@uniformdev/canvas';
import { httpRequest } from 'http-request';
import { logger } from 'log';
import { createResponse } from 'create-response';

export async function responseProvider(request: EW.ResponseProviderRequest) {
	try {
		const projectId = request.getVariable('PMUSER_UNIFORM_PROJECTID');
		const apiKey = request.getVariable('PMUSER_UNIFORM_API_KEY');

		//	logger.log('Debug: Starting request processing');
		//	logger.log(`Debug: ProjectId: ${projectId}`);
		//	logger.log(`Debug: Original URL: ${request.url}`);

		if (!projectId) {
			return createResponse(500, { 'Content-Type': 'text/html' }, '<html><body><h1>ProjectId is undefined</h1></body></html>');
		}
		if (!apiKey) {
			return createResponse(500, { 'Content-Type': 'text/html' }, '<html><body><h1>ApiKey is undefined</h1></body></html>');
		}

		// Parse URL manually
		const originalUrl = request.url;
		//	logger.log(`Debug: Original URL: ${originalUrl}`);
		const [path, search] = originalUrl.split('?');

		// Construct URL with explicit protocol and hostname
		const uniformUrl = `https://uniform.global${path}?${search}`;
		//	logger.log(`Debug: Uniform URL: ${uniformUrl}`);

		// Extract quirks from headers
		const quirks: Record<string, string> = {};
		const headers = request.getHeaders();
		for (const headerName in headers) {
			if (headerName.startsWith('x-quirk-')) {
				const headerValue = headers[headerName];
				if (headerValue && headerValue.length > 0) {
					quirks[headerName.replace('x-quirk-', '')] = headerValue[0];
				}
			}
		}

		// Extract ufvd cookie value
		const cookieHeader = request.getHeader('Cookie')?.[0] || '';
		let ufvdCookieValue = '';
		let quirkCookieValue = '';

		// Split the cookies string into individual cookies
		const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());

		// Extract values from individual cookies
		for (const cookie of cookies) {
			logger.log('individual cookie', cookie);
			if (cookie.startsWith('ufvd=')) {
				ufvdCookieValue = cookie.substring(5);
			} else if (cookie.startsWith('ufvdqk=')) {
				quirkCookieValue = cookie.substring(7);
			}
		}

		// Fetch the response and segment data concurrently
		const requestOptions = {
			headers: {
				'x-api-key': apiKey,
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'User-Agent': 'Akamai-EdgeWorkers',
				Host: 'uniform.global',
			},
			method: 'GET',
			timeout: 5000,
		};

		//	logger.log('Debug: Sending request to Uniform');
		const fetchResponse = await httpRequest(uniformUrl, {
			...requestOptions,
		});
		//	logger.log(`Debug: Response status: ${fetchResponse.status}`);

		const responseText = await fetchResponse.text();
		//	logger.log(`Debug: Response body: ${responseText}`);

		// Check if response is OK and URL is valid
		if (fetchResponse.ok && path.toLowerCase() === '/api/v1/route') {
			const route: RouteGetResponse = JSON.parse(responseText);
			//	logger.log('Debug: Successfully parsed response JSON');

			if (route.type === 'composition') {
				await processComposition({
					route,
					quirks,
					cookieValue: ufvdCookieValue,
					quirkCookieValue,
				});

				return createResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify(route));
			}
		}

		// If we get here, something went wrong
		//logger.log(`Debug: Falling through to default response. Status: ${fetchResponse.status}`);
		return createResponse(fetchResponse.status, { 'Content-Type': 'application/json' }, responseText);
	} catch (error) {
		//logger.log(`Debug: Error caught: ${error}`);
		return createResponse(500, { 'Content-Type': 'text/html' }, `<html><body><h1>Internal Server Error: ${error}</h1></body></html>`);
	}
}

const processComposition = async ({
	route,
	quirks,
	cookieValue,
	quirkCookieValue,
}: {
	route: RouteGetResponseComposition;
	quirks: Record<string, string>;
	cookieValue?: string;
	quirkCookieValue?: string;
}) => {
	const context = new Context({
		manifest: manifest as ManifestV2,
		defaultConsent: true,
		transitionStore: new CookieTransitionDataStore({
			cookieName: 'ufvd',
			serverCookieValue: cookieValue,
			quirkCookieName: 'ufvdqk',
			quirkCookieValue: quirkCookieValue,
			experimental_quirksEnabled: true,
		}),
	});
	//logger.log('quirks inside process composition', JSON.stringify(context.quirks));
	//logger.log('scores inside process composition', JSON.stringify(context.scores));

	await context.update({
		quirks: {
			...quirks,
		},
	});

	//logger.log('context scores:', JSON.stringify(context.scores));

	walkNodeTree(route.compositionApiResponse.composition, async (treeNode) => {
		if (treeNode.type === 'component') {
			const { node, actions } = treeNode;

			if (node.type === CANVAS_PERSONALIZE_TYPE) {
				const slot = node.slots?.[CANVAS_PERSONALIZE_SLOT];
				const trackingEventName = node.parameters?.['trackingEventName'] as ComponentParameter<string>;
				const count = node.parameters?.['count'] as ComponentParameter<number | string>;
				const algorithm = node.parameters?.['algorithm'] as ComponentParameter<string>;

				let parsedCount: number | undefined;
				if (count) {
					if (typeof count.value === 'string') {
						parsedCount = parseInt(count.value, 10);
					} else if (typeof count.value === 'number') {
						parsedCount = count.value;
					} else {
						parsedCount = 1; // Default to 1 if not specified
					}
				} else {
					parsedCount = 1; // Default to 1 if count parameter is missing
				}

				const mapped = mapSlotToPersonalizedVariations(slot);

				const { variations, personalized } = context.personalize({
					name: trackingEventName.value ?? 'Untitled Personalization',
					variations: mapped,
					take: parsedCount,
					algorithm: algorithm?.value,
				});

				logger.log('personalized', personalized);

				if (!variations) {
					actions.remove();
				} else {
					const [first, ...rest] = variations;

					const cleanVariant = (variant: any) => {
						const cleaned = { ...variant };
						delete cleaned.pz;
						delete cleaned.control;
						delete cleaned.id;
						if (cleaned.parameters) {
							delete cleaned.parameters.$pzCrit;
						}
						return cleaned;
					};

					if (first) {
						actions.replace(cleanVariant(first));
					}

					if (rest.length) {
						actions.insertAfter(rest.map(cleanVariant));
					}
				}
			} else if (node.type === CANVAS_TEST_TYPE) {
				const slot = node.slots?.[CANVAS_TEST_SLOT];
				const testName = node.parameters?.['test'] as ComponentParameter<string | undefined>;
				const mapped = mapSlotToTestVariations(slot);

				const { result } = context.test({
					name: testName.value ?? 'Untitled Test',
					variations: mapped,
				});

				if (!result) {
					actions.remove();
				} else {
					actions.replace(result);
				}
			}
		}
	});
};
