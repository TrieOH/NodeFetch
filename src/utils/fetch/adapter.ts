import type { DefaultFailureEnvelope, DefaultSuccessEnvelope } from "./envelopes";
import type { FetchClient } from "./client";
import { TimeoutError } from "./timeout";
import classifyNetworkError from "./error-classifier";

// ─── FetchAdapter ─────────────────────────────────────────────────────────────

/**
 * Structural contract for anything that can execute a fetch request on behalf
 * of a {@link FetchClient}.
 *
 * The built-in browser `fetch` satisfies this interface out of the box.
 * Any auth wrapper, proxy, or adapter that exposes the same signature
 * (e.g. `adapter.fetch.bind(adapter)`) can be plugged in without
 * `fetch-utils` needing to know about its internals.
 *
 * @param url     - Full URL to request.
 * @param options - Standard `RequestInit` options.
 */
export type FetchAdapter = (url: string, options?: RequestInit) => Promise<Response>;


// ─── Default adapters ─────────────────────────────────────────────────────────

/** Internal raw shape expected by the default adapters. */
type RawDefault<T> = Partial<DefaultSuccessEnvelope> & {
  data?: T;
  error_id?: string;
  trace?: string[];
};

/**
 * Built-in `toSuccess` adapter for the default envelope scheme.
 *
 * Reads `module`, `message`, `timestamp`, `code`, and `data` from the raw
 * JSON body, applying sensible fallbacks for any absent fields.
 *
 * @param raw - Parsed JSON body.
 */
export function defaultToSuccess<T>(raw: unknown): DefaultSuccessEnvelope & { data: T } {
  const r = (raw ?? {}) as RawDefault<T>;
  return {
    module: r.module ?? "Unknown",
    message: r.message ?? "OK",
    timestamp: r.timestamp ?? new Date().toISOString(),
    code: r.code ?? 200,
    data: r.data as T,
  };
}

/**
 * Built-in `toFailure` adapter for the default envelope scheme.
 *
 * Reads standard error fields from the raw JSON body, applying fallbacks for
 * absent fields. `status` is used as the `code` fallback.
 *
 * @param raw    - Parsed JSON body, or `undefined` on parse failure.
 * @param status - HTTP response status code.
 */
export function defaultToFailure(raw: unknown, status: number): DefaultFailureEnvelope {
  const r = (raw ?? {}) as RawDefault<unknown>;
  return {
    module: r.module ?? "Unknown",
    message: r.message ?? "An unknown error occurred",
    timestamp: r.timestamp ?? new Date().toISOString(),
    code: r.code ?? status,
    error_id: r.error_id ?? "UNKNOWN_ERROR",
    trace: r.trace,
  };
}

/**
 * Built-in `onNetworkError` adapter for the default envelope scheme.
 *
 * Wraps any caught JS exception (network failure, {@link TimeoutError}, etc.)
 * into a failure envelope with code `503` and error ID
 * `"CLIENT_NETWORK_ERROR"`.
 *
 * @param error - The caught exception.
 */
export function defaultOnNetworkError(error: unknown): DefaultFailureEnvelope {
  const classified = classifyNetworkError(error);

  return {
    module: "Network",
    message: classified.message,
    timestamp: new Date().toISOString(),
    code: classified.code,
    error_id: classified.errorId,
    trace: classified.trace,
  };
}