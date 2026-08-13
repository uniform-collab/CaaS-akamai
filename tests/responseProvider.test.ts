import { httpRequest } from 'http-request';
import { createResponse } from 'create-response';
import { Context, CookieTransitionDataStore, type ManifestV2 } from '@uniformdev/context';
import { responseProvider } from '../src/main';
import { visitorFromClientPayload } from '../src/visitorPayload';
import manifest from '../src/context-manifest.json';

const httpRequestMock = httpRequest as jest.Mock;
const createResponseMock = createResponse as jest.Mock;

const compositionResponse = {
	type: 'composition',
	matchedRoute: '/',
	dynamicInputs: {},
	compositionApiResponse: {
		composition: {
			_name: 'Root',
			_id: '53973f04-30c4-41c0-aeb6-38d34c61b3a0',
			_slug: '/',
			type: 'page',
			projectMapNodes: [
				{
					id: '80c60764-688e-4c32-a2c1-0632fa637cd7',
					projectMapId: '0a49ceed-2b17-433e-97b2-b4a9e256d707',
					path: '/',
					locales: {},
					data: {},
				},
			],
			parameters: {
				title: { type: 'text', value: 'Home Page' },
			},
			slots: {
				content: [
					{
						type: '$personalization',
						slots: {
							pz: [
								{
									type: 'hero',
									parameters: {
										title: { type: 'text', value: 'TD: Hero For Developers' },
										$pzCrit: {
											type: '$pzCrit',
											value: {
												dim: 'isdevelopersignal',
												crit: [{ l: 'isdevelopersignal', r: '10', op: '>' }],
												name: 'TD:Developer',
											},
										},
									},
								},
								{
									type: 'hero',
									parameters: {
										title: { type: 'text', value: 'TD: Default Hero' },
										$pzCrit: {
											type: '$pzCrit',
											value: { crit: [], name: 'TD:Default' },
										},
									},
								},
							],
						},
						parameters: {
							count: { type: 'number', value: '1' },
							trackingEventName: { type: 'text', value: 'Personalization with TD' },
						},
					},
				],
			},
		},
		projectId: 'a3ccbf9a-f51d-4022-8e2f-3dd31d6cde9a',
		state: 64,
		created: '2025-02-17T23:59:39.080481+00:00',
		modified: '2025-08-21T14:55:02.875463+00:00',
		pattern: false,
	},
};

type MockResponse = { status: number; headers: Record<string, string>; body: string };

function createRequest(overrides: Partial<EW.ResponseProviderRequest> = {}): EW.ResponseProviderRequest {
	return {
		url: '/api/v1/route?path=/',
		method: 'GET',
		getVariable: (name: string) => {
			if (name === 'PMUSER_UNIFORM_PROJECTID') return 'project-id';
			if (name === 'PMUSER_UNIFORM_API_KEY') return 'api-key';
			return undefined;
		},
		getHeaders: () => ({}),
		getHeader: () => null,
		text: async () => '',
		json: async () => ({}),
		...overrides,
	} as EW.ResponseProviderRequest;
}

describe('responseProvider client body option', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		createResponseMock.mockImplementation((status, headers, body) => ({ status, headers, body } as MockResponse));
		httpRequestMock.mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify(compositionResponse),
		});
	});

	it('applies POST quirks as new context state so signals can score', async () => {
		const identity = visitorFromClientPayload({
			quirks: { role: 'developer' },
			device: { os: 'ios' },
		});
		const context = new Context({
			manifest: manifest as ManifestV2,
			defaultConsent: true,
			transitionStore: new CookieTransitionDataStore({
				cookieName: 'ufvd',
				serverCookieValue: identity.cookieValue,
				quirkCookieName: 'ufvdqk',
				quirkCookieValue: identity.quirkCookieValue,
				experimental_quirksEnabled: true,
			}),
		});
		await context.update({ quirks: identity.quirks });
		expect({
			quirks: identity.quirks,
			scores: context.scores,
			cookieValue: identity.cookieValue,
		}).toMatchObject({
			quirks: { role: 'developer' },
			scores: { isdevelopersignal: 50 },
		});
	});

	it('personalizes a POST with visitor JSON and still fetches Uniform via GET', async () => {
		const request = createRequest({
			method: 'POST',
			text: async () =>
				JSON.stringify({
					quirks: { role: 'developer' },
					device: { os: 'ios' },
				}),
			getHeader: () => ['ufvd=ismarketersignal-50'],
			getHeaders: () => ({ 'x-quirk-role': ['marketer'] }),
		});

		const response = (await responseProvider(request)) as MockResponse;
		const body = JSON.parse(response.body);

		expect(httpRequestMock).toHaveBeenCalledWith(
			'https://uniform.global/api/v1/route?path=/',
			expect.objectContaining({ method: 'GET' })
		);
		expect(response.status).toBe(200);
		expect(response.headers['x-uniform-visitor-source']).toBe('client-body');
		expect(body.compositionApiResponse.composition.slots.content[0]).toMatchObject({
			type: 'hero',
			parameters: { title: { value: 'TD: Hero For Developers' } },
		});
	});

	it('still personalizes GET requests from cookies and x-quirk-* headers', async () => {
		const request = createRequest({
			method: 'GET',
			getHeaders: () => ({ 'x-quirk-role': ['developer'] }),
			getHeader: () => ['ufvd=isdevelopersignal-10'],
		});

		const response = (await responseProvider(request)) as MockResponse;
		const body = JSON.parse(response.body);

		expect(httpRequestMock).toHaveBeenCalledWith(
			'https://uniform.global/api/v1/route?path=/',
			expect.objectContaining({ method: 'GET' })
		);
		expect(response.headers['x-uniform-visitor-source']).toBe('cookies');
		expect(body.compositionApiResponse.composition.slots.content[0]).toMatchObject({
			type: 'hero',
			parameters: { title: { value: 'TD: Hero For Developers' } },
		});
	});

	it('rejects oversized POST visitor bodies', async () => {
		const request = createRequest({
			method: 'POST',
			text: async () => JSON.stringify({ quirks: { blob: 'x'.repeat(2000) } }),
		});

		const response = (await responseProvider(request)) as MockResponse;

		expect(httpRequestMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(JSON.parse(response.body).error).toMatch(/2000 characters/);
	});
});
