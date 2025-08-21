import { Context, ManifestV2, CookieTransitionDataStore } from '@uniformdev/context';
import { 
	RouteGetResponseComposition, 
	walkNodeTree, 
	mapSlotToPersonalizedVariations,
	mapSlotToTestVariations,
	CANVAS_PERSONALIZE_TYPE,
	CANVAS_PERSONALIZE_SLOT,
	CANVAS_TEST_TYPE,
	CANVAS_TEST_SLOT
} from '@uniformdev/canvas';
import manifest from '../src/context-manifest.json';
import { processComposition } from '../src/main';

describe('processComposition Integration Tests', () => {
	const testCookieValue = 'mytest-var1!mytest2-var2~ses1-x!ses2-1~vis1-fa~isdevelopersignal-10';
	const quirks = { role: 'developer' };

	// Comprehensive test payload with all configurations
	const comprehensivePayload: RouteGetResponseComposition = {
		type: "composition",
		matchedRoute: "/",
		dynamicInputs: {},
		compositionApiResponse: {
			composition: {
				"_name": "Root",
				"_id": "53973f04-30c4-41c0-aeb6-38d34c61b3a0",
				"_slug": "/",
				"type": "page",
				"projectMapNodes": [
					{
						"id": "80c60764-688e-4c32-a2c1-0632fa637cd7",
						"projectMapId": "0a49ceed-2b17-433e-97b2-b4a9e256d707",
						"path": "/",
						"locales": {},
						"data": {}
					}
				],
				"parameters": {
					"title": {
						"type": "text",
						"value": "Home Page"
					}
				},
				"slots": {
					"content": [
						{
							"type": "$personalization",
							"slots": {
								"pz": [
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "TD: Hero For Developers"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"dim": "isdevelopersignal",
													"crit": [
														{
															"l": "isdevelopersignal",
															"r": "10",
															"op": ">"
														}
													],
													"name": "TD:Developer"
												}
											}
										}
									},
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "TD: Hero For Marketers"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"dim": "ismarketersignal",
													"crit": [
														{
															"l": "ismarketersignal",
															"r": "10",
															"op": ">"
														}
													],
													"name": "TD:Marketer"
												}
											}
										}
									},
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "TD: Default Hero"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"crit": [],
													"name": "TD:Default"
												}
											}
										}
									}
								]
							},
							"parameters": {
								"count": {
									"type": "number",
									"value": "1"
								},
								"trackingEventName": {
									"type": "text",
									"value": "Personalization with TD"
								}
							}
						},
						{
							"type": "$personalization",
							"slots": {
								"pz": [
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "TDND: Hero For Developers"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"dim": "isdevelopersignal",
													"crit": [
														{
															"l": "isdevelopersignal",
															"r": "10",
															"op": ">"
														}
													],
													"name": "TDND:Developer"
												}
											}
										}
									},
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "TDND: Hero For Marketers"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"dim": "ismarketersignal",
													"crit": [
														{
															"l": "ismarketersignal",
															"r": "10",
															"op": ">"
														}
													],
													"name": "TDND:Marketer"
												}
											}
										}
									},
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "TDND: Role Hero"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"crit": [
														{
															"l": "role",
															"r": "developer",
															"t": "q",
															"op": "="
														}
													],
													"name": "TDND:Role"
												}
											}
										}
									}
								]
							},
							"parameters": {
								"count": {
									"type": "number",
									"value": "1"
								},
								"trackingEventName": {
									"type": "text",
									"value": "Personalization with TD and no Default"
								}
							}
						},
						{
							"type": "$personalization",
							"slots": {
								"pz": [
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "SSC: Hero for Developer"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"dim": "isdevelopersignal",
													"name": "SSC:Developer"
												}
											}
										}
									},
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "SSC: Hero for Marketer"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"dim": "ismarketersignal",
													"name": "SSC:Marketer"
												}
											}
										}
									},
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "SSC: Default Hero"
											},
											"$pzCrit": {
												"type": "$pzCrit",
												"value": {
													"name": "SSC:Default"
												}
											}
										}
									}
								]
							},
							"parameters": {
								"algorithm": {
									"type": "pzAlgorithm",
									"value": "ssc"
								},
								"trackingEventName": {
									"type": "text",
									"value": "Personalization with SSC"
								}
							}
						},
						{
							"type": "$test",
							"slots": {
								"test": [
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "Hero Test var 1"
											},
											"$tstVrnt": {
												"type": "testVariant",
												"value": {
													"id": "var1"
												}
											}
										}
									},
									{
										"type": "hero",
										"parameters": {
											"title": {
												"type": "text",
												"value": "Hero Test Var 2"
											},
											"$tstVrnt": {
												"type": "testVariant",
												"value": {
													"id": "var2"
												}
											}
										}
									}
								]
							},
							"parameters": {
								"test": {
									"type": "testSelect",
									"value": "mytest"
								}
							}
						}
					]
				}
			},
			"projectId": "a3ccbf9a-f51d-4022-8e2f-3dd31d6cde9a",
			"state": 64,
			"created": "2025-02-17T23:59:39.080481+00:00",
			"modified": "2025-08-21T14:55:02.875463+00:00",
			"pattern": false
		}
	};



	describe('Top-Down Personalization', () => {
		it('should replace TD personalization with "TD: Hero For Developers"', async () => {
			// Create payload with only TD personalization
			const tdPayload = {
				type: "composition" as const,
				matchedRoute: "/",
				dynamicInputs: {},
				compositionApiResponse: {
					composition: {
						...comprehensivePayload.compositionApiResponse.composition,
						slots: {
							content: [comprehensivePayload.compositionApiResponse.composition.slots!.content[0]] // Only TD personalization
						}
					},
					projectId: "a3ccbf9a-f51d-4022-8e2f-3dd31d6cde9a",
					state: 64,
					created: "2025-02-17T23:59:39.080481+00:00",
					modified: "2025-08-21T14:55:02.875463+00:00",
					pattern: false
				}
			};

			await processComposition({
				route: tdPayload,
				quirks,
				cookieValue: testCookieValue,
				quirkCookieValue: '',
			});

			const contentSlot = tdPayload.compositionApiResponse.composition.slots.content;
			
			// Should be replaced with the developer hero
			expect(contentSlot).toHaveLength(1);
			expect(contentSlot[0].type).toBe('hero');
			expect(contentSlot[0].parameters?.title?.value).toBe('TD: Hero For Developers');
			
			// Ensure personalization metadata is cleaned up
			expect((contentSlot[0] as any).parameters?.$pzCrit).toBeUndefined();
			expect((contentSlot[0] as any).pz).toBeUndefined();
			expect((contentSlot[0] as any).control).toBeUndefined();
			expect((contentSlot[0] as any).id).toBeUndefined();
		});
	});

	describe('Top-Down No Default Personalization', () => {
		it('should remove TDND personalization when no criteria match', async () => {
			// Use different quirks and cookie to ensure no match
			const noMatchQuirks = { role: 'designer' }; // Won't match any criteria
			const noMatchCookie = 'isdevelopersignal-5!ismarketersignal-5'; // Both signals below threshold

			// Create payload with only TDND personalization
			const tdndPayload = {
				type: "composition" as const,
				matchedRoute: "/",
				dynamicInputs: {},
				compositionApiResponse: {
					composition: {
						...comprehensivePayload.compositionApiResponse.composition,
						slots: {
							content: [comprehensivePayload.compositionApiResponse.composition.slots!.content[1]] // Only TDND personalization
						}
					},
					projectId: "a3ccbf9a-f51d-4022-8e2f-3dd31d6cde9a",
					state: 64,
					created: "2025-02-17T23:59:39.080481+00:00",
					modified: "2025-08-21T14:55:02.875463+00:00",
					pattern: false
				}
			};

			await processComposition({
				route: tdndPayload,
				quirks: noMatchQuirks,
				cookieValue: noMatchCookie,
				quirkCookieValue: '',
			});

			const contentSlot = tdndPayload.compositionApiResponse.composition.slots.content;

			
			// Should be removed entirely since no criteria match and no default
			expect(contentSlot).toHaveLength(0);
		});
	});

	describe('SSC Personalization', () => {
		it('should replace SSC personalization with "SSC: Hero for Developer"', async () => {
			// Create payload with only SSC personalization
			const sscPayload = {
				type: "composition" as const,
				matchedRoute: "/",
				dynamicInputs: {},
				compositionApiResponse: {
					composition: {
						...comprehensivePayload.compositionApiResponse.composition,
						slots: {
							content: [comprehensivePayload.compositionApiResponse.composition.slots!.content[2]] // Only SSC personalization
						}
					},
					projectId: "a3ccbf9a-f51d-4022-8e2f-3dd31d6cde9a",
					state: 64,
					created: "2025-02-17T23:59:39.080481+00:00",
					modified: "2025-08-21T14:55:02.875463+00:00",
					pattern: false
				}
			};

			await processComposition({
				route: sscPayload,
				quirks,
				cookieValue: testCookieValue,
				quirkCookieValue: '',
			});

			const contentSlot = sscPayload.compositionApiResponse.composition.slots.content;

			
			// Should be replaced with the developer hero using SSC algorithm
			expect(contentSlot).toHaveLength(1);
			expect(contentSlot[0].type).toBe('hero');
			expect(contentSlot[0].parameters?.title?.value).toBe('SSC: Hero for Developer');
			
			// Ensure personalization metadata is cleaned up
			expect((contentSlot[0] as any).parameters?.$pzCrit).toBeUndefined();
			expect((contentSlot[0] as any).pz).toBeUndefined();
			expect((contentSlot[0] as any).control).toBeUndefined();
			expect((contentSlot[0] as any).id).toBeUndefined();
		});
	});

	describe('A/B Testing', () => {
		it('should replace test with selected variant Hero Test var 1', async () => {
			// Create payload with only test
			const testPayload = {
				type: "composition" as const,
				matchedRoute: "/",
				dynamicInputs: {},
				compositionApiResponse: {
					composition: {
						...comprehensivePayload.compositionApiResponse.composition,
						slots: {
							content: [comprehensivePayload.compositionApiResponse.composition.slots!.content[3]] // Only A/B test
						}
					},
					projectId: "a3ccbf9a-f51d-4022-8e2f-3dd31d6cde9a",
					state: 64,
					created: "2025-02-17T23:59:39.080481+00:00",
					modified: "2025-08-21T14:55:02.875463+00:00",
					pattern: false
				}
			};

			await processComposition({
				route: testPayload,
				quirks,
				cookieValue: testCookieValue,
				quirkCookieValue: '',
			});

			const contentSlot = testPayload.compositionApiResponse.composition.slots.content;
          
			// Should be replaced with var1 test variant
			expect(contentSlot).toHaveLength(1);
			expect(contentSlot[0].type).toBe('hero');
			expect(contentSlot[0].parameters?.title?.value).toBe('Hero Test var 1');
			
			// Test metadata ($tstVrnt) should be cleaned up as it's a system property
			expect((contentSlot[0] as any).parameters?.$tstVrnt).toBeUndefined();

		});
	});

	it('should verify context initialization and signal processing', async () => {
		// Create a context manually to verify it processes the cookie correctly
		const context = new Context({
			manifest: manifest as ManifestV2,
			defaultConsent: true,
			transitionStore: new CookieTransitionDataStore({
				cookieName: 'ufvd',
				serverCookieValue: testCookieValue,
				quirkCookieName: 'ufvdqk',
				quirkCookieValue: '',
				experimental_quirksEnabled: true,
			}),
		});

		await context.update({ quirks });

		// Verify the context has the expected scores and quirks
		// The signal has a base strength of 50 from the manifest, plus cookie value
		expect(context.scores.isdevelopersignal).toBe(50);
		expect(context.quirks.role).toBe('developer');
		
		// The cookie contains isdevelopersignal-10, which should be processed
		// along with the quirk role=developer triggering the signal
	});
});
