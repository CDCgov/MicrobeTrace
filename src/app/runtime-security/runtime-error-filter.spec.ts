import { shouldIgnoreRuntimeError } from './runtime-error-filter';

describe('shouldIgnoreRuntimeError', () => {
  it('ignores browser extension connection noise', () => {
    expect(shouldIgnoreRuntimeError('Could not establish connection. Receiving end does not exist.')).toBeTrue();
    expect(shouldIgnoreRuntimeError(new Error('Failed to connect to MetaMask'))).toBeTrue();
  });

  it('ignores extension script stack traces', () => {
    expect(shouldIgnoreRuntimeError({
      message: 'Unexpected failure',
      stack: 'Error: boom\n    at chrome-extension://abc123/content.js:1:1',
    })).toBeTrue();
  });

  it('does not ignore application errors', () => {
    expect(shouldIgnoreRuntimeError(new Error('MicrobeTrace blew up'))).toBeFalse();
    expect(shouldIgnoreRuntimeError('Cannot read properties of undefined')).toBeFalse();
  });
});
