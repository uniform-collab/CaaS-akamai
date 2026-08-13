import { httpRequest } from 'http-request';
import { createResponse } from 'create-response';
import { responseProvider } from '../src/main';

const httpRequestMock = httpRequest as jest.Mock;
const createResponseMock = createResponse as jest.Mock;

const compositionResponse = {
	type: 'composition',
	matchedRoute: '/',
	dynamicInputs: {},
	compositionApiResponse: {
		composition: {
			_name: 'Root',
			_id: 'root',
			type: 'page',
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
		projectId: 'test',
		state: 64,
		created: '2025-02-17T23:59:39.080481+00:00',
		modified: '2025-08-21T14:55:02.875463+00:00',
		pattern: false,
	},
};

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
		createResponseMock.mockImplementation((status, headers, body) => ({ status, headers, body }));
		httpRequestMock.mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify(compositionResponse),
		});
	});

	it('personalizes a POST with visitor JSON and still fetches Uniform via GET', async () => {
		const request = createRequest({
			method: 'POST',
			text: async () =>
				JSON.stringify({
					quirks: { role: 'developer' },
					scores: { isdevelopersignal: 10 },
					device: { os: 'ios' },
				}),
			getHeader: () => ['ufvd=ismarketersignal-50'],
			getHeaders: () => ({ 'x-quirk-role': ['marketer'] }),
		});

		const response = await responseProvider(request);
		const body = JSON.parse(response.body);

		expect(httpRequestMock).toHaveBeenCalledWith(
			'https://uniform.global/api/v1/route?path=/',
			expect.objectContaining({ method: 'GET' })
		);
		expect(response.status).toBe(200);
		expect(body.compositionApiResponse.composition.slots.content[0].parameters.title.value).toBe(
			'TD: Hero For Developers'
		);
	});

	it('rejects oversized POST visitor bodies', async () => {
		const request = createRequest({
			method: 'POST',
			text: async () => JSON.stringify({ quirks: { blob: 'x'.repeat(2000) } }),
		});

		const response = await responseProvider(request);

		expect(httpRequestMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(JSON.parse(response.body).error).toMatch(/2000 characters/);
	});
});
