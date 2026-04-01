import {
  validateTtsHealthResponse,
} from './sidecar-response.validator';

describe('sidecar-response.validator', () => {
  describe('validateTtsHealthResponse', () => {
    it('returns ready/device for valid values', () => {
      expect(validateTtsHealthResponse({ ready: true, device: 'gpu' }, 'Test')).toEqual({
        ready: true,
        device: 'gpu',
      });
    });

    it('normalizes invalid values to safe defaults', () => {
      expect(validateTtsHealthResponse({ ready: 'yes', device: 'metal' }, 'Test')).toEqual({
        ready: false,
        device: null,
      });
    });

    it('throws when the body is not an object', () => {
      expect(() => validateTtsHealthResponse('bad-response', 'Test')).toThrow(
        'Test health response is not an object',
      );
    });
  });
});
