/**
 * Creates a promise whose settlement is controlled from the outside.
 *
 * Useful in tests to hand a pending promise to code under test and later
 * settle it on demand, e.g. to block a call until the test is ready to let it
 * continue, or to wait until the code under test reaches a certain point.
 *
 * @example
 * // Gate: block a dependency until the test lets it proceed
 * const gate = deferred();
 * mock.start.mockReturnValue(gate.promise);
 * await runWorker(dependencies);
 * gate.resolve(); // unblock the worker
 *
 * @example
 * // Signal: observe when code under test reaches a point
 * const reached = deferred();
 * mock.stop.mockImplementation(() => reached.resolve());
 * await reached.promise;
 */
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}
