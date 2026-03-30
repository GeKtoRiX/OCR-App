import {
  validateF5HealthResponse,
  validateVoxtralHealthResponse,
} from './sidecar-response.validator';

describe('sidecar-response.validator', () => {
  describe('validateF5HealthResponse', () => {
    it('returns ready/device for valid values', () => {
      expect(validateF5HealthResponse({ ready: true, device: 'gpu' })).toEqual({
        ready: true,
        device: 'gpu',
      });
    });

    it('normalizes invalid values to safe defaults', () => {
      expect(validateF5HealthResponse({ ready: 'yes', device: 'metal' })).toEqual({
        ready: false,
        device: null,
      });
    });

    it('throws when the body is not an object', () => {
      expect(() => validateF5HealthResponse('bad-response')).toThrow(
        'F5 health response is not an object',
      );
    });
  });

  describe('validateVoxtralHealthResponse', () => {
    it('returns ready/device for valid values', () => {
      expect(validateVoxtralHealthResponse({ ready: true, device: 'gpu' })).toEqual({
        ready: true,
        device: 'gpu',
      });
    });

    it('normalizes invalid values to safe defaults', () => {
      expect(validateVoxtralHealthResponse({ ready: 'yes', device: 'metal' })).toEqual({
        ready: false,
        device: null,
      });
    });

    it('throws when the body is not an object', () => {
      expect(() => validateVoxtralHealthResponse('bad-response')).toThrow(
        'Voxtral health response is not an object',
      );
    });
  });
});
