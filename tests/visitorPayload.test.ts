import { parseScoreCookie } from '@uniformdev/context';
import {
	CLIENT_VISITOR_BODY_MAX_CHARS,
	parseVisitorBody,
	resolveVisitorIdentity,
	visitorFromClientPayload,
	visitorFromCookiesAndHeaders,
} from '../src/visitorPayload';

describe('parseVisitorBody', () => {
	it('accepts quirks, scores, tests, device, enrichments, and events', () => {
		const parsed = parseVisitorBody(
			JSON.stringify({
				quirks: { role: 'developer' },
				device: { os: 'ios', type: 'phone', foldable: false },
				scores: { isdevelopersignal: 10 },
				sessionScores: { ses1: 2 },
				tests: { mytest: 'var1' },
				enrichments: [{ cat: 'audience', key: 'dev', str: 10 }],
				events: [{ event: 'app_open' }],
			})
		);

		expect(parsed.status).toBe('ok');
		if (parsed.status !== 'ok') {
			return;
		}

		expect(parsed.payload.quirks).toEqual({ role: 'developer' });
		expect(parsed.payload.device).toEqual({ os: 'ios', type: 'phone', foldable: false });
		expect(parsed.payload.scores).toEqual({ isdevelopersignal: 10 });
		expect(parsed.payload.tests).toEqual({ mytest: 'var1' });
		expect(parsed.payload.enrichments).toEqual([{ cat: 'audience', key: 'dev', str: 10 }]);
		expect(parsed.payload.events).toEqual([{ event: 'app_open' }]);
	});

	it('rejects bodies over the showcase 2000 character cap', () => {
		const payload = JSON.stringify({ quirks: { blob: 'x'.repeat(CLIENT_VISITOR_BODY_MAX_CHARS) } });
		expect(payload.length).toBeGreaterThan(CLIENT_VISITOR_BODY_MAX_CHARS);
		expect(parseVisitorBody(payload).status).toBe('too-large');
	});

	it('rejects invalid JSON and non-objects', () => {
		expect(parseVisitorBody('not-json').status).toBe('invalid-json');
		expect(parseVisitorBody('["nope"]').status).toBe('invalid-json');
		expect(parseVisitorBody('').status).toBe('empty');
	});
});

describe('visitorFromClientPayload', () => {
	it('encodes scores and tests into the same cookie format CDP injection would use', () => {
		const identity = visitorFromClientPayload({
			quirks: { role: 'developer' },
			scores: { isdevelopersignal: 10 },
			tests: { mytest: 'var1' },
		});

		expect(identity.source).toBe('client-body');
		expect(identity.quirks).toEqual({ role: 'developer' });

		const decoded = parseScoreCookie(identity.cookieValue, identity.quirkCookieValue);
		expect(decoded?.scores?.isdevelopersignal).toBe(10);
		expect(decoded?.tests?.mytest).toBe('var1');
		expect(identity.cookieValue.length).toBeGreaterThan(0);
		expect(identity.quirkCookieValue).toBe('');
	});

	it('flattens device attributes into quirks without overwriting explicit quirks', () => {
		const identity = visitorFromClientPayload({
			quirks: { os: 'android' },
			device: { os: 'ios', type: 'phone' },
		});

		expect(identity.quirks).toEqual({ os: 'android', type: 'phone' });
	});
});

describe('resolveVisitorIdentity', () => {
	it('uses POST JSON instead of cookies and quirk headers', async () => {
		const result = await resolveVisitorIdentity({
			method: 'POST',
			text: async () =>
				JSON.stringify({
					quirks: { role: 'developer' },
					scores: { isdevelopersignal: 10 },
				}),
			getHeaders: () => ({ 'x-quirk-role': ['marketer'] }),
			getHeader: (name) => (name === 'Cookie' ? ['ufvd=ismarketersignal-50'] : null),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}

		expect(result.identity.source).toBe('client-body');
		expect(result.identity.quirks).toEqual({ role: 'developer' });
		expect(result.identity.cookieValue).not.toContain('ismarketersignal');
		expect(parseScoreCookie(result.identity.cookieValue)?.scores?.isdevelopersignal).toBe(10);
	});

	it('falls back to cookies and x-quirk-* headers for GET', async () => {
		const result = await resolveVisitorIdentity({
			method: 'GET',
			getHeaders: () => ({ 'x-quirk-role': ['developer'] }),
			getHeader: (name) =>
				name === 'Cookie' ? ['session=abc; ufvd=isdevelopersignal-10; ufvdqk=country-us'] : null,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}

		expect(result.identity).toEqual({
			source: 'cookies',
			quirks: { role: 'developer' },
			cookieValue: 'isdevelopersignal-10',
			quirkCookieValue: 'country-us',
		});
	});

	it('falls back to cookies when POST has an empty body', async () => {
		const result = await resolveVisitorIdentity({
			method: 'POST',
			text: async () => '',
			getHeaders: () => ({}),
			getHeader: () => ['ufvd=isdevelopersignal-10'],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.identity.source).toBe('cookies');
		expect(result.identity.cookieValue).toBe('isdevelopersignal-10');
	});

	it('returns 400 for oversized or invalid POST bodies', async () => {
		const tooLarge = await resolveVisitorIdentity({
			method: 'POST',
			text: async () => `{"quirks":{"blob":"${'x'.repeat(CLIENT_VISITOR_BODY_MAX_CHARS)}"}}`,
			getHeaders: () => ({}),
			getHeader: () => null,
		});
		expect(tooLarge).toMatchObject({ ok: false, status: 400 });

		const invalid = await resolveVisitorIdentity({
			method: 'POST',
			text: async () => '{bad',
			getHeaders: () => ({}),
			getHeader: () => null,
		});
		expect(invalid).toMatchObject({ ok: false, status: 400 });
	});
});

describe('visitorFromCookiesAndHeaders', () => {
	it('reads x-quirk-* headers and ufvd cookies', () => {
		const identity = visitorFromCookiesAndHeaders({
			getHeaders: () => ({
				'x-quirk-role': ['developer'],
				accept: ['application/json'],
			}),
			getHeader: () => ['ufvd=mytest-var1; ufvdqk=role-developer'],
		});

		expect(identity.source).toBe('cookies');
		expect(identity.quirks).toEqual({ role: 'developer' });
		expect(identity.cookieValue).toBe('mytest-var1');
		expect(identity.quirkCookieValue).toBe('role-developer');
	});
});
