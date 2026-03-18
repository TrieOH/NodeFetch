import { logger } from "../logger";
import { createFetchClient } from "./client";
import { type TimeoutError, withTimeout } from "./timeout";

// ─── simpleFetch ──────────────────────────────────────────────────────────────

/** Options for the lightweight {@link simpleFetch} utility. */
export interface SimpleFetchOptions {
  /** HTTP method. Defaults to `GET`. */
  method?: string;
  /**
   * Additional request headers merged on top of the default
   * `Content-Type: application/json`.
   */
  headers?: Record<string, string>;
  /** Pre-serialized request body string. */
  body?: string;
  /**
   * Request timeout in milliseconds. If the server does not respond within
   * this window the promise rejects with a {@link TimeoutError}.
   * Omit to disable timeout.
   */
  timeout?: number;
}

/**
 * Minimal fetch wrapper that sends `credentials: "include"` and
 * `Content-Type: application/json`, then returns the parsed JSON body typed
 * as `T`.
 *
 * Prefer {@link createFetchClient} for feature-rich usage (auth adapter,
 * envelope adapters, retries). Use `simpleFetch` only for lightweight one-off
 * requests where the full client is unnecessary.
 *
 * @param url     - Full URL to request.
 * @param options - Optional request configuration.
 * @returns Parsed response body typed as `T`.
 * @throws {@link TimeoutError} when a timeout is set and exceeded.
 * @throws `Error` when the response body cannot be parsed as JSON.
 */
export async function simpleFetch<T>(url: string, options?: SimpleFetchOptions): Promise<T> {
  const fetchCall = fetch(url, {
    method: options?.method,
    body: options?.body,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const response = await (options?.timeout
    ? withTimeout(fetchCall, options.timeout)
    : fetchCall);

  const data = await response.json().catch(() => {
    logger.error(`simpleFetch: failed to parse JSON response from ${url}`);
    throw new Error(`Failed to parse JSON response from ${url}`);
  });

  return data as T;
}
