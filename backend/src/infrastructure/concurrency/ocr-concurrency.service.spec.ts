import { OcrConcurrencyService } from './ocr-concurrency.service';

describe('OcrConcurrencyService', () => {
  it('releases the semaphore after a successful call', async () => {
    const service = new OcrConcurrencyService();

    await expect(service.withLock(async () => 'ok')).resolves.toBe('ok');
    await expect(service.withLock(async () => 'still-ok')).resolves.toBe(
      'still-ok',
    );
  });

  it('releases the semaphore after a failed call', async () => {
    const service = new OcrConcurrencyService();

    await expect(
      service.withLock(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(service.withLock(async () => 'recovered')).resolves.toBe(
      'recovered',
    );
  });
});
