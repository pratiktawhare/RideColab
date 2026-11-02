// Test environment setup
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-that-is-at-least-32-characters-long!!';
process.env['PORT'] = '4001';
process.env['APP_VERSION'] = '1.0.0-test';

// Mock expo-server-sdk for testing environment
jest.mock('expo-server-sdk', () => {
  class MockExpo {
    static isExpoPushToken(token: unknown): boolean {
      return typeof token === 'string' && token.startsWith('ExponentPushToken[');
    }
    sendPushNotificationsAsync = jest.fn().mockResolvedValue([]);
    chunkPushNotifications = jest.fn((messages: unknown[]) => [messages]);
  }
  return {
    __esModule: true,
    default: MockExpo,
    Expo: MockExpo,
  };
});

jest.setTimeout(15000);
