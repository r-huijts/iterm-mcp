import { jest, describe, expect, test, beforeEach } from '@jest/globals';
import ProcessTracker from '../../src/ProcessTracker.js';

// Simple mocks
jest.mock('fs', () => ({
  existsSync: jest.fn()
}));

jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const mockExecAsync = jest.fn();
jest.mock('util', () => ({
  promisify: jest.fn().mockReturnValue(mockExecAsync)
}));

describe('ProcessTracker', () => {
  let processTracker: ProcessTracker;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Configure mocks
    jest.requireMock('fs').existsSync.mockReturnValue(true);
    
    // Initialize the process tracker
    processTracker = new ProcessTracker();
  });
  
  test('should be instantiable', () => {
    expect(processTracker).toBeInstanceOf(ProcessTracker);
  });
  
  test('getActiveProcess should return null if TTY path does not exist', async () => {
    // Arrange
    jest.requireMock('fs').existsSync.mockReturnValue(false);
    
    // Act
    const result = await processTracker.getActiveProcess('/dev/nonexistent');
    
    // Assert
    expect(result).toBeNull();
  });
});