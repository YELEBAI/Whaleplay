import { afterEach, describe, expect, it } from "vitest";
import { GenerationTaskRunner } from "./generation-task-runner";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("GenerationTaskRunner", () => {
  const runner = new GenerationTaskRunner();

  afterEach(() => runner.abortAll());

  it("keeps a task alive when its caller stops awaiting it", async () => {
    const pending = deferred<string>();
    const task = runner.startExclusive("route:survives", async () => pending.promise);

    expect(runner.isRunning("route:survives")).toBe(true);
    pending.resolve("done");

    await expect(task).resolves.toBe("done");
    expect(runner.isRunning("route:survives")).toBe(false);
  });

  it("aborts an active task", async () => {
    const task = runner.startExclusive("abort:one", async ({ signal }) => {
      await new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      return "unreachable";
    });

    await Promise.resolve();
    runner.abort("abort:one");

    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(runner.isRunning("abort:one")).toBe(false);
  });

  it("marks a replaced task stale even if it ignores abort", async () => {
    const pending = deferred<void>();
    let firstIsCurrent = true;
    const first = runner.startExclusive("exclusive:key", async (context) => {
      await pending.promise;
      firstIsCurrent = context.isCurrent();
    });
    await Promise.resolve();

    await runner.startExclusive("exclusive:key", async ({ isCurrent }) => {
      expect(isCurrent()).toBe(true);
    });
    pending.resolve();
    await first;

    expect(firstIsCurrent).toBe(false);
  });

  it("runs different keys independently", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const taskA = runner.startExclusive("parallel:a", async () => a.promise);
    const taskB = runner.startExclusive("parallel:b", async () => b.promise);

    a.resolve("a");
    await expect(taskA).resolves.toBe("a");
    expect(runner.isRunning("parallel:b")).toBe(true);

    b.resolve("b");
    await expect(taskB).resolves.toBe("b");
  });
});
