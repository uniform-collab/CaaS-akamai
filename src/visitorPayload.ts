import {
	emptyVisitorData,
	serializeCookie,
	type EnrichmentData,
	type EventData,
	type Quirks,
	type ScoreVector,
	type Tests,
} from '@uniformdev/context';

/**
 * Showcase limit for the client-supplied visitor JSON body.
 * Akamai allows much larger request bodies in responseProvider; this cap
 * keeps the payload in cookie-replacement territory (device, scores, quirks).
 */
export const CLIENT_VISITOR_BODY_MAX_CHARS = 2000;

export type ClientVisitorPayload = {
	/** Visitor quirks (role, geo, device attributes, etc.) */
	quirks?: Quirks;
	/** Convenience bag of device attributes, merged into quirks as strings */
	device?: Record<string, string | number | boolean>;
	/** Permanent visitor scores (same data the ufvd cookie would carry) */
	scores?: ScoreVector;
	/** Session scores */
	sessionScores?: ScoreVector;
	/** Sticky A/B test assignments: { [testName]: variantId } */
	tests?: Tests;
	/** Enrichments to apply via context.update (CDP / client events) */
	enrichments?: EnrichmentData[];
	/** Analytics events that may trigger event signals */
	events?: EventData[];
};

export type ResolvedVisitorIdentity = {
	source: 'client-body' | 'cookies';
	quirks: Quirks;
	cookieValue: string;
	quirkCookieValue: string;
	enrichments?: EnrichmentData[];
	events?: EventData[];
};

export type ResolveVisitorResult =
	| { ok: true; identity: ResolvedVisitorIdentity }
	| { ok: false; status: 400; message: string };

export type VisitorRequest = {
	method?: string;
	text?: () => Promise<string>;
	getHeaders: () => { [key: string]: string[] };
	getHeader: (name: string) => string[] | null;
};

export function parseVisitorBody(raw: string | undefined | null):
	| { status: 'ok'; payload: ClientVisitorPayload }
	| { status: 'empty' }
	| { status: 'too-large' }
	| { status: 'invalid-json' } {
	const trimmed = raw?.trim() ?? '';
	if (!trimmed) {
		return { status: 'empty' };
	}
	if (trimmed.length > CLIENT_VISITOR_BODY_MAX_CHARS) {
		return { status: 'too-large' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return { status: 'invalid-json' };
	}

	if (!isPlainObject(parsed)) {
		return { status: 'invalid-json' };
	}

	return { status: 'ok', payload: normalizeClientVisitorPayload(parsed) };
}

export function visitorFromClientPayload(payload: ClientVisitorPayload): ResolvedVisitorIdentity {
	const quirks: Quirks = { ...(payload.quirks ?? {}) };

	if (payload.device) {
		for (const [key, value] of Object.entries(payload.device)) {
			if (value === undefined || value === null || quirks[key] !== undefined) {
				continue;
			}
			quirks[key] = String(value);
		}
	}

	const visitorData = {
		...emptyVisitorData(),
		quirks: {},
		scores: payload.scores ?? {},
		sessionScores: payload.sessionScores ?? {},
		tests: payload.tests ?? {},
		controlGroup: false,
	};

	return {
		source: 'client-body',
		quirks,
		// Scores/tests use the ufvd cookie encoding. Quirks stay off the quirk
		// cookie so context.update() sees them as new and signal criteria run.
		cookieValue: serializeCookie(visitorData),
		quirkCookieValue: '',
		enrichments: payload.enrichments,
		events: payload.events,
	};
}

export function visitorFromCookiesAndHeaders(request: VisitorRequest): ResolvedVisitorIdentity {
	const quirks = extractHeaderQuirks(request.getHeaders());
	const cookieHeader = request.getHeader('Cookie')?.[0] || '';
	const { ufvdCookieValue, quirkCookieValue } = extractUniformCookies(cookieHeader);

	return {
		source: 'cookies',
		quirks,
		cookieValue: ufvdCookieValue,
		quirkCookieValue,
	};
}

export async function resolveVisitorIdentity(request: VisitorRequest): Promise<ResolveVisitorResult> {
	const method = (request.method || 'GET').toUpperCase();

	if (method === 'POST' && typeof request.text === 'function') {
		const parsed = parseVisitorBody(await request.text());

		if (parsed.status === 'too-large') {
			return {
				ok: false,
				status: 400,
				message: `Visitor body exceeds ${CLIENT_VISITOR_BODY_MAX_CHARS} characters`,
			};
		}

		if (parsed.status === 'invalid-json') {
			return {
				ok: false,
				status: 400,
				message: 'Visitor body must be JSON object with quirks, scores, tests, enrichments, and/or events',
			};
		}

		if (parsed.status === 'ok') {
			return { ok: true, identity: visitorFromClientPayload(parsed.payload) };
		}
	}

	return { ok: true, identity: visitorFromCookiesAndHeaders(request) };
}

export function extractHeaderQuirks(headers: { [key: string]: string[] }): Quirks {
	const quirks: Quirks = {};
	for (const headerName in headers) {
		if (headerName.startsWith('x-quirk-')) {
			const headerValue = headers[headerName];
			if (headerValue && headerValue.length > 0) {
				quirks[headerName.replace('x-quirk-', '')] = headerValue[0];
			}
		}
	}
	return quirks;
}

export function extractUniformCookies(cookieHeader: string): {
	ufvdCookieValue: string;
	quirkCookieValue: string;
} {
	let ufvdCookieValue = '';
	let quirkCookieValue = '';
	const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());

	for (const cookie of cookies) {
		if (cookie.startsWith('ufvd=')) {
			ufvdCookieValue = cookie.substring(5);
		} else if (cookie.startsWith('ufvdqk=')) {
			quirkCookieValue = cookie.substring(7);
		}
	}

	return { ufvdCookieValue, quirkCookieValue };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined || entry === null) {
			continue;
		}
		result[key] = String(entry);
	}
	return result;
}

function asNumberRecord(value: unknown): ScoreVector | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	const result: ScoreVector = {};
	for (const [key, entry] of Object.entries(value)) {
		const numeric = typeof entry === 'number' ? entry : Number(entry);
		if (!Number.isFinite(numeric)) {
			continue;
		}
		result[key] = numeric;
	}
	return result;
}

function asEnrichments(value: unknown): EnrichmentData[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const enrichments: EnrichmentData[] = [];
	for (const item of value) {
		if (!isPlainObject(item)) {
			continue;
		}
		if (typeof item.cat !== 'string' || typeof item.key !== 'string') {
			continue;
		}
		const str = typeof item.str === 'number' ? item.str : Number(item.str);
		if (!Number.isFinite(str)) {
			continue;
		}
		enrichments.push({ cat: item.cat, key: item.key, str });
	}
	return enrichments;
}

function asEvents(value: unknown): EventData[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const events: EventData[] = [];
	for (const item of value) {
		if (!isPlainObject(item) || typeof item.event !== 'string') {
			continue;
		}
		events.push({ event: item.event });
	}
	return events;
}

function asDevice(value: unknown): Record<string, string | number | boolean> | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	const device: Record<string, string | number | boolean> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
			device[key] = entry;
		}
	}
	return device;
}

function normalizeClientVisitorPayload(value: Record<string, unknown>): ClientVisitorPayload {
	return {
		quirks: asStringRecord(value.quirks),
		device: asDevice(value.device),
		scores: asNumberRecord(value.scores),
		sessionScores: asNumberRecord(value.sessionScores),
		tests: asStringRecord(value.tests),
		enrichments: asEnrichments(value.enrichments),
		events: asEvents(value.events),
	};
}
