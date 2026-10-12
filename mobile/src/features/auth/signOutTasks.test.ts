import { registerSignOutTask, runSignOutTasks } from './signOutTasks';

describe('signOutTasks', () => {
  it('runs registered tasks and stops running unregistered ones', async () => {
    const task = jest.fn(() => Promise.resolve());
    const unregister = registerSignOutTask(task);
    await runSignOutTasks();
    expect(task).toHaveBeenCalledTimes(1);
    unregister();
    await runSignOutTasks();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('a failing task never rejects or stops the others', async () => {
    const ok = jest.fn(() => Promise.resolve());
    const u1 = registerSignOutTask(() => Promise.reject(new Error('boom')));
    const u2 = registerSignOutTask(() => {
      throw new Error('sync boom');
    });
    const u3 = registerSignOutTask(ok);
    await expect(runSignOutTasks()).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalled();
    [u1, u2, u3].forEach((u) => u());
  });

  it('a hanging task cannot hold Sign Out past the timeout', async () => {
    const u = registerSignOutTask(() => new Promise<void>(() => {}));
    const started = Date.now();
    await runSignOutTasks(30);
    expect(Date.now() - started).toBeLessThan(1000);
    u();
  });
});
