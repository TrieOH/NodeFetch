// ─── Timeout ──────────────────────────────────────────────────────────────────

/**
 * Thrown when a fetch request exceeds its configured timeout duration.
 */
export class TimeoutError extends Error {
  /** The timeout duration (ms) that was exceeded. */
  readonly ms: number;

  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.ms = ms;
  }
}

/**
 * Races `promise` against a timer. Rejects with {@link TimeoutError} if the
 * promise does not settle within `ms` milliseconds. The timer is always
 * cleared once the original promise settles to avoid memory leaks.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;

  const timer = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });

  return Promise.race([promise.finally(() => clearTimeout(timerId)), timer]);
}
