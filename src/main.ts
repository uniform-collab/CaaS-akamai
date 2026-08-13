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
import {
	Context,
	ManifestV2,
	CookieTransitionDataStore,
	type EnrichmentData,
	type EventData,
	type Quirks,
} from '@uniformdev/context';
import manifest from './context-manifest.json';
import { walkNodeTree } from '@uniformdev/canvas';
import { CANVAS_TEST_SLOT } from '@uniformdev/canvas';
import { httpRequest } from 'http-request';
import { logger } from 'log';
import { createResponse } from 'create-response';
import { resolveVisitorIdentity } from './visitorPayload';

export async function responseProvider(request: EW.ResponseProviderRequest) {
	try {
		const projectId = request.getVariable('PMUSER_UNIFORM_PROJECTID');
		const apiKey = request.getVariable('PMUSER_UNIFORM_API_KEY');

		if (!projectId) {
			return createResponse(500, { 'Content-Type': 'text/html' }, '<html><body><h1>ProjectId is undefined</h1></body></html>');
		}
		if (!apiKey) {
			return createResponse(500, { 'Content-Type': 'text/html' }, '<html><body><h1>ApiKey is undefined</h1></body></html>');
		}

		const visitorResult = await resolveVisitorIdentity(request);
		if (!visitorResult.ok) {
			return createResponse(visitorResult.status, { 'Content-Type': 'application/json' }, JSON.stringify({ error: visitorResult.message }));
		}

		const { identity } = visitorResult;

		if (identity.source === 'cookies') {
			const cookieHeader = request.getHeader('Cookie')?.[0] || '';
			const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
			for (const cookie of cookies) {
				logger.log('individual cookie', cookie);
			}
		}

		const originalUrl = request.url;
		const [path, search] = originalUrl.split('?');
		const uniformUrl = `https://uniform.global${path}?${search}`;

		// Outbound fetch stays GET so Property Manager can cache the Uniform composition.
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

		const fetchResponse = await httpRequest(uniformUrl, {
			...requestOptions,
		});

		const responseText = await fetchResponse.text();

		if (fetchResponse.ok && path.toLowerCase() === '/api/v1/route') {
			const route: RouteGetResponse = JSON.parse(responseText);

			if (route.type === 'composition') {
				await processComposition({
					route,
					quirks: identity.quirks,
					cookieValue: identity.cookieValue,
					quirkCookieValue: identity.quirkCookieValue,
					enrichments: identity.enrichments,
					events: identity.events,
				});

				return createResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify(route));
			}
		}

		return createResponse(fetchResponse.status, { 'Content-Type': 'application/json' }, responseText);
	} catch (error) {
		return createResponse(500, { 'Content-Type': 'text/html' }, `<html><body><h1>Internal Server Error: ${error}</h1></body></html>`);
	}
}

export const processComposition = async ({
	route,
	quirks,
	cookieValue,
	quirkCookieValue,
	enrichments,
	events,
}: {
	route: RouteGetResponseComposition;
	quirks: Quirks;
	cookieValue?: string;
	quirkCookieValue?: string;
	enrichments?: EnrichmentData[];
	events?: EventData[];
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

	const update: { quirks: Quirks; enrichments?: EnrichmentData[]; events?: EventData[] } = {
		quirks: {
			...quirks,
		},
	};
	if (enrichments?.length) {
		update.enrichments = enrichments;
	}
	if (events?.length) {
		update.events = events;
	}

	await context.update(update);

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

				const { variations } = context.personalize({
					name: trackingEventName.value ?? 'Untitled Personalization',
					variations: mapped,
					take: parsedCount,
					algorithm: algorithm?.value,
				});

				if (variations.length === 0) {
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
					const cleanTestVariant = (variant: any) => {
						const cleaned = { ...variant };
						if (cleaned.parameters) {
							delete cleaned.parameters.$tstVrnt;
						}
						delete cleaned.id;
						delete cleaned.testDistribution;
						return cleaned;
					};

					actions.replace(cleanTestVariant(result));
				}
			}
		}
	});
};
