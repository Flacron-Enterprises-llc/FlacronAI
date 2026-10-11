/**
 * Work that must run *before* Firebase sign-out, while the session can still authenticate a
 * request (e.g. removing this device's push token from the account). Features register a task;
 * `AuthProvider.logout` runs them all first.
 *
 * Never blocks or fails Sign Out: every task is isolated, errors are swallowed, and the whole
 * set is capped at `timeoutMs`.
 */
type SignOutTask = () => Promise<void>;

const tasks = new Set<SignOutTask>();

export function registerSignOutTask(task: SignOutTask): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

export async function runSignOutTasks(timeoutMs = 4000): Promise<void> {
  if (tasks.size === 0) return;
  const all = Promise.all([...tasks].map((task) => Promise.resolve().then(task).catch(() => {})));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([all, timeout]);
  if (timer) clearTimeout(timer);
}
