export interface GenerationTaskContext {
  key: string;
  controller: AbortController;
  signal: AbortSignal;
  isCurrent: () => boolean;
}

type TaskRunner<T> = (context: GenerationTaskContext) => Promise<T>;

interface ActiveTask<T = unknown> {
  controller: AbortController;
  promise: Promise<T>;
}

/**
 * Owns long-running generation tasks outside React's lifecycle.
 *
 * A task is cancelled only by an explicit abort or by starting a replacement
 * with the same key. Callers must use isCurrent() before committing terminal
 * state so a stale, non-cooperative task cannot overwrite its replacement.
 */
export class GenerationTaskRunner {
  private readonly tasks = new Map<string, ActiveTask>();

  startExclusive<T>(key: string, runner: TaskRunner<T>): Promise<T> {
    this.abort(key);

    const controller = new AbortController();
    const task: ActiveTask<T> = {
      controller,
      promise: Promise.resolve() as Promise<T>,
    };
    const context: GenerationTaskContext = {
      key,
      controller,
      signal: controller.signal,
      isCurrent: () => this.tasks.get(key) === task,
    };

    task.promise = Promise.resolve()
      .then(() => runner(context))
      .finally(() => {
        if (this.tasks.get(key) === task) this.tasks.delete(key);
      });
    this.tasks.set(key, task);
    return task.promise;
  }

  abort(key: string): void {
    const task = this.tasks.get(key);
    if (!task) return;
    this.tasks.delete(key);
    task.controller.abort();
  }

  abortByPrefix(prefix: string): void {
    for (const key of [...this.tasks.keys()]) {
      if (key.startsWith(prefix)) this.abort(key);
    }
  }

  abortAll(): void {
    for (const key of [...this.tasks.keys()]) this.abort(key);
  }

  isRunning(key: string): boolean {
    return this.tasks.has(key);
  }
}

export const generationTaskRunner = new GenerationTaskRunner();
