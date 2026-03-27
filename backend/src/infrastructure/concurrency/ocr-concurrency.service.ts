import { Injectable } from '@nestjs/common';
import { Semaphore } from './semaphore';

@Injectable()
export class OcrConcurrencyService {
  private readonly maxConcurrency = parseInt(
    process.env.MAX_CONCURRENT_OCR || '3',
    10,
  );
  private readonly semaphore: Semaphore;

  constructor() {
    this.semaphore = new Semaphore(this.maxConcurrency);
  }

  get pending(): number {
    return this.semaphore.pending;
  }

  isBackpressured(): boolean {
    return this.pending >= this.maxConcurrency * 2;
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await fn();
    } finally {
      this.semaphore.release();
    }
  }
}
