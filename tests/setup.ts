// Test setup file

// Global mocks for EdgeWorkers environment modules
global.jest = require('jest');

// Create a mock logger that can be imported
const mockLogger = {
	log: jest.fn(),
};

// Make the mock available globally
(global as any).mockLogger = mockLogger;
