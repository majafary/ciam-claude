import '@testing-library/jest-dom';
import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Global test setup
beforeAll(() => {
  // Mock environment variables
  process.env.NODE_ENV = 'test';

  // Mock localStorage
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
  });

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  Object.defineProperty(window, 'sessionStorage', {
    value: sessionStorageMock
  });

  // Mock fetch
  global.fetch = jest.fn();

  // Mock window.location
  delete (window as any).location;
  window.location = {
    ...window.location,
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    assign: jest.fn(),
    replace: jest.fn(),
    reload: jest.fn(),
  };
});

afterAll(() => {
  // Clean up after all tests
  jest.resetAllMocks();
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
  (fetch as jest.Mock).mockClear();
  (window.localStorage.getItem as jest.Mock).mockClear();
  (window.localStorage.setItem as jest.Mock).mockClear();
  (window.localStorage.removeItem as jest.Mock).mockClear();
});

afterEach(() => {
  // Clean up after each test
  jest.clearAllTimers();
});

// Mock console methods in test environment
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};