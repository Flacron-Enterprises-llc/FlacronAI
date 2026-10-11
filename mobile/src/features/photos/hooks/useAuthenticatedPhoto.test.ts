import { withPhotoFetchSlot } from './useAuthenticatedPhoto';

jest.mock('@/services/localData/fileCache', () => ({ writeCachedPhoto: jest.fn() }));

describe('withPhotoFetchSlot — bounded concurrent photo downloads', () => {
  it('never runs more than 4 fetches at once, and runs them all eventually', async () => {
    let running = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const task = () =>
      withPhotoFetchSlot(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
      });

    const all = Promise.all(Array.from({ length: 10 }, task));
    for (let i = 0; i < 50 && (releases.length > 0 || running > 0); i += 1) {
      await Promise.resolve();
      await Promise.resolve();
      releases.shift()?.();
    }
    await all;
    expect(peak).toBeLessThanOrEqual(4);
    expect(running).toBe(0);
  });

  it('frees the slot when a fetch fails', async () => {
    await expect(withPhotoFetchSlot(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(withPhotoFetchSlot(async () => 'ok')).resolves.toBe('ok');
  });
});
