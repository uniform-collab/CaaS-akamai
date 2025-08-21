module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src', '<rootDir>/tests'],
	testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
	transform: {
		'^.+\\.ts$': 'ts-jest',
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^log$': '<rootDir>/tests/__mocks__/log.js',
		'^http-request$': '<rootDir>/tests/__mocks__/http-request.js',
		'^create-response$': '<rootDir>/tests/__mocks__/create-response.js',
	},
	setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.d.ts',
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
};
