import { CANVAS_PERSONALIZE_SLOT, CANVAS_PERSONALIZE_TYPE, CANVAS_TEST_TYPE, ComponentParameter, RouteGetResponse, RouteGetResponseComposition, mapSlotToPersonalizedVariations, mapSlotToTestVariations } from "@uniformdev/canvas";
import { Context, ManifestV2 } from "@uniformdev/context";
import manifest from './context-manifest.json';
import { walkNodeTree } from "@uniformdev/canvas";
import { CANVAS_TEST_SLOT } from "@uniformdev/canvas";
import { Buffer } from 'node:buffer';

interface Env {
	UNIFORM_API_KEY: string;
	UNIFORM_PROJECT_ID: string;
	SEGMENT_API_KEY: string;
	SEGMENT_SPACE_ID: string;
}

const STORE_USER_COOKIE_NAME = 'demos_user_id';
const STORE_ANONYMOUS_ID_COOKIE_NAME = 'ajs_anonymous_id';

declare namespace SegmentProfile {
	interface SegmentData {
		traits?: Record<string, string | number | boolean>;
	}

	interface OrderCompletedEvent {
		products: string;
		amount: number;
		categories: string;
	}

	interface SelectProductEvent {
		product: string;
		categories: string;
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		url.hostname = 'uniform.global';
		url.protocol = 'https:';
		url.port = '';
		url.searchParams.set('projectId', env.UNIFORM_PROJECT_ID);

		const quirks: Record<string, string> = {};

		request.headers.forEach((value, key) => {
			if (key.startsWith('x-quirk-')) {
				quirks[key.replace('x-quirk-', '')] = value;
			}
		});

		const [response, segmentData] = await Promise.all([
			fetch(url.toString(), {
				...request,
				headers: {
					...request.headers,
					'x-api-key': env.UNIFORM_API_KEY,
				},
			}),
			requestSegmentData({
				userId: request.headers.get(STORE_USER_COOKIE_NAME),
				anonymousId: request.headers.get(STORE_ANONYMOUS_ID_COOKIE_NAME),
				env,
			})
		]);

		// is ok and json
		const isOk = response.ok && url.pathname.toLowerCase() === '/api/v1/route';

		if (isOk) {
			const route = await response.json() as RouteGetResponse;

			if (route.type === 'composition') {
				await processComposition({
					route,
					segmentData,
					quirks,
				});

				return new Response(JSON.stringify(route), {
					status: response.status,
					headers: response.headers,
				});
			}
		}

		return response as any;
	},
} satisfies ExportedHandler<Env>;

const requestSegmentData = async ({
	userId,
	anonymousId,
	env,
}: {
	userId: string | null;
	anonymousId: string | null;
	env: Pick<Env, 'SEGMENT_API_KEY' | 'SEGMENT_SPACE_ID'>;
}): Promise<SegmentProfile.SegmentData['traits'] | undefined> => {
	let traits: SegmentProfile.SegmentData['traits'] | undefined;

	if (userId) {
		traits = await getSegmentTraitsByUserId({
			env,
			userId,
		});
	}

	if (anonymousId && !traits) {
		traits = await getSegmentTraitsByAnonymousId({
			anonymousId,
			env,
		});
	}

	return traits;
}

export const getSegmentTraitsById = async ({
	idSlug,
	env,
}: {
	idSlug: string;
	env: Pick<Env, 'SEGMENT_API_KEY' | 'SEGMENT_SPACE_ID'>;
}) => {
	const BASE_URL = `https://profiles.segment.com/v1/spaces/${env.SEGMENT_SPACE_ID}/collections/users/profiles`;
	const BASIC_AUTH = Buffer.from(env.SEGMENT_API_KEY + ':').toString('base64');

	const response = await fetch(`${BASE_URL}${idSlug}/traits`, {
		headers: {
			Authorization: `Basic ${BASIC_AUTH}`
		},
	});

	const result = await response.json() as SegmentProfile.SegmentData;

	return result;
}

export const getSegmentTraitsByAnonymousId = async ({
	anonymousId,
	env,
}: {
	anonymousId: string;
	env: Pick<Env, 'SEGMENT_API_KEY' | 'SEGMENT_SPACE_ID'>;
}) => {
	if (!env.SEGMENT_SPACE_ID || !env.SEGMENT_API_KEY) {
		console.info('The segment environment variables are not configured');
		return {};
	}

	const segmentData = await getSegmentTraitsById({
		env,
		idSlug: `/anonymous_id:${anonymousId}`,
	});

	return segmentData?.traits || {};
};

export const getSegmentTraitsByUserId = async ({
	userId,
	env,
}: {
	userId: string;
	env: Pick<Env, 'SEGMENT_API_KEY' | 'SEGMENT_SPACE_ID'>;
}) => {
	if (!env.SEGMENT_SPACE_ID || !env.SEGMENT_API_KEY) {
		console.info('The segment environment variables are not configured');
		return {};
	}

	const segmentData = await getSegmentTraitsById({
		env,
		idSlug: `/user_id:${userId}`,
	});

	return segmentData?.traits || {};
};

const processComposition = async ({
	route,
	segmentData,
	quirks,
}: {
	route: RouteGetResponseComposition;
	segmentData: SegmentProfile.SegmentData['traits'];
	quirks: Record<string, string>;
}) => {
	const context = new Context({
		manifest: manifest as ManifestV2,
		defaultConsent: true,
	});

	await context.update({
		quirks: {
			...formatQuirksFormTraits(segmentData),
			...quirks,
		}
	});

	walkNodeTree(route.compositionApiResponse.composition, async (treeNode) => {
		if (treeNode.type === 'component') {
			const {
				node,
				actions,
			} = treeNode;

			if (node.type === CANVAS_PERSONALIZE_TYPE) {
				const slot = node.slots?.[CANVAS_PERSONALIZE_SLOT];
				const trackingEventName = node.parameters?.['trackingEventName'] as ComponentParameter<string>;
				const count = node.parameters?.['count'] as ComponentParameter<number | string>;

				let parsedCount: number | undefined;

				if (typeof count === 'string') {
					parsedCount = parseInt(count, 10);
				} else if (typeof count !== 'number') {
					parsedCount = undefined;
				} else {
					parsedCount = count || 1;
				}

				const mapped = mapSlotToPersonalizedVariations(slot);

				const {
					variations
				} = context.personalize({
					name: trackingEventName.value ?? 'Untitled Personalization',
					variations: mapped,
					take: parsedCount,
				});

				if (!variations) {
					actions.remove();
				} else {
					const [first, ...rest] = variations;

					if (first) {
						actions.replace(first);
					}

					if (rest.length) {
						actions.insertAfter(rest);
					}
				}
			} else if (node.type === CANVAS_TEST_TYPE) {
				const slot = node.slots?.[CANVAS_TEST_SLOT];
				const testName = node.parameters?.['test'] as ComponentParameter<string | undefined>;
				const mapped = mapSlotToTestVariations(slot);

				const {
					result
				} = context.test({
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

}

export const formatQuirksFormTraits = (traits: SegmentProfile.SegmentData['traits'] = {}) =>
	Object.keys(traits).reduce((accumulator: Record<string, string>, key) => {
		accumulator[key.replaceAll('_', '')] = String(traits[key]);
		return accumulator;
	}, {}
	);