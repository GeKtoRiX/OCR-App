import { Semaphore } from './semaphore';

describe('Semaphore', () => {
  it('acquires immediately while capacity is available', async () => {
    const semaphore = new Semaphore(2);

    await semaphore.acquire();

    expect(semaphore.active).toBe(1);
    expect(semaphore.pending).toBe(0);
  });

  it('queues acquires when the semaphore is full and resumes them on release', async () => {
    const semaphore = new Semaphore(1);

    await semaphore.acquire();

    let secondResolved = false;
    const secondAcquire = semaphore.acquire().then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    expect(secondResolved).toBe(false);
    expect(semaphore.active).toBe(1);
    expect(semaphore.pending).toBe(1);

    semaphore.release();
    await secondAcquire;

    expect(secondResolved).toBe(true);
    expect(semaphore.active).toBe(1);
    expect(semaphore.pending).toBe(0);

    semaphore.release();
    expect(semaphore.active).toBe(0);
  });
});
