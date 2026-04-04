import type { FetchAdapter } from "./adapter";
import type { FetchResult } from "./envelopes";
import { withTimeout } from "./timeout";
import type { createDefaultFetchClient } from "./default";

// ─── Per-request options ──────────────────────────────────────────────────────

/** Per-request options accepted by every method of a {@link FetchClient}. */
export interface FetchClientOptions {
  /** Override the HTTP method. Normally set by the helper methods. */
  method?: string;
  /**
   * Additional headers merged on top of the client-level defaults.
   * `Content-Type: application/json` is included by default and can be
   * overridden here.
   */
  headers?: Record<string, string>;
  /**
   * Pre-serialized request body string.
   * For `post`, `put`, `patch`, and `delete`, the body object is serialized
   * automatically — you rarely need to set this manually.
   */
  body?: string;
  /**
   * Per-request timeout in milliseconds. Overrides the client-level `timeout`.
   * Omit to fall back to the client default (or no timeout if none is set).
   */
  timeout?: number;
  /**
   * Credentials mode passed to the underlying `fetch` call.
   * Defaults to `"include"`.
   */
  credentials?: RequestCredentials;
  /**
   * Extra `RequestInit` fields forwarded verbatim to the {@link FetchAdapter}.
   * Use this to pass adapter-specific options (e.g. auth flags on a custom
   * wrapper) without polluting the core options interface.
   */
  adapterInit?: Omit<RequestInit, "method" | "headers" | "body" | "credentials">;
}

// ─── FetchClientConfig ────────────────────────────────────────────────────────

/**
 * Configuration object passed to {@link createFetchClient}.
 *
 * The three adapter functions (`toSuccess`, `toFailure`, `onNetworkError`) are
 * the main extension points: they let you control how raw server responses and
 * caught exceptions are mapped to your application's envelope types without
 * touching the HTTP or auth logic.
 *
 * @typeParam TSuccessEnvelope - Shape of a successful response's metadata
 *   (everything except `success` and `data`).
 * @typeParam TFailureEnvelope - Shape of a failed response
 *   (everything except `success`).
 */
export interface FetchClientConfig<
  TSuccessEnvelope extends object,
  TFailureEnvelope extends object,
> {
  /**
   * Base URL prepended to every relative path.
   * A trailing slash on `baseURL` and a leading slash on the path are both
   * trimmed to avoid double-slash issues.
   *
   * Only used when no `adapter` is provided. When an adapter is
   * configured it manages its own `baseURL` internally.
   */
  baseURL?: string;

  /**
   * Global request timeout in milliseconds applied to every request.
   * Can be overridden per-request via {@link FetchClientOptions.timeout}.
   * Omit to disable timeout globally.
   */
  timeout?: number;

  /**
   * When provided, all requests go through `adapter.fetch`, which handles
   */
  adapter?: FetchAdapter;

  /**
   * Default headers merged into every request before per-request headers.
   * `Content-Type: application/json` is always included as the lowest-priority
   * default and can be overridden here or at the request level.
   */
  headers?: Record<string, string>;

  /**
   * Determines whether a parsed response body + `Response` object should be
   * treated as a success.
   *
   * Defaults to `response.ok` (HTTP 2xx range).
   *
   * @param raw      - Parsed JSON body, or `undefined` on parse failure.
   * @param response - The raw `Response` object (gives access to status, headers…).
   */
  isSuccess?: (raw: unknown, response: Response) => boolean;

  /**
   * Maps a successful raw JSON body to the typed success envelope.
   *
   * The returned object must satisfy `TSuccessEnvelope & { data: T }`.
   * The client automatically merges `{ success: true }` so you don't need to
   * include it.
   *
   * @param raw - Parsed JSON body.
   */
  toSuccess: <T>(raw: unknown) => TSuccessEnvelope & { data: T };

  /**
   * Maps a failed raw JSON body to the typed failure envelope.
   *
   * Called when `isSuccess` returns `false` or when JSON parsing produces
   * `undefined`. The client automatically merges `{ success: false }`.
   *
   * @param raw    - Parsed JSON body, or `undefined` on parse failure.
   * @param status - HTTP response status code.
   */
  toFailure: (raw: unknown, status: number) => TFailureEnvelope;

  /**
   * Produces a failure envelope from a caught JS exception.
   *
   * Called when `fetch` itself throws — typically a network failure, CORS
   * error, or {@link TimeoutError}. The client automatically merges
   * `{ success: false }`.
   *
   * @param error - The caught exception.
   */
  onNetworkError: (error: unknown) => TFailureEnvelope;

  /**
   * Default credentials mode applied to every request.
   * Can be overridden per request via {@link FetchClientOptions.credentials}.
   *
   * Defaults to `"include"`.
   */
  credentials?: RequestCredentials;
}

// ─── FetchClientError ─────────────────────────────────────────────────────────

/**
 * Thrown by {@link FetchClient.query} when a request results in a failure.
 * Grants access to the fully-typed failure envelope.
 *
 * @typeParam TFailureEnvelope - The failure envelope type of the originating client.
 */
export class FetchClientError<TFailureEnvelope extends object> extends Error {
  /**
   * The complete failure envelope, including `success: false`.
   * Inspect this for error codes, messages, or server traces.
   */
  readonly envelope: TFailureEnvelope & { success: false };

  constructor(envelope: TFailureEnvelope & { success: false }) {
    super((envelope as { message?: string }).message ?? "Request failed");
    this.name = "FetchClientError";
    this.envelope = envelope;
  }
}

// ─── FetchClient interface ────────────────────────────────────────────────────

/**
 * HTTP client returned by {@link createFetchClient}.
 *
 * Every method except {@link FetchClient.query} returns a {@link FetchResult} discriminated
 * union — narrow on `result.success` before accessing `result.data`.
 * {@link FetchClient.query} resolves to `TData` directly and throws {@link FetchClientError}
 * on failure, making it compatible with query libraries such as TanStack Query.
 *
 * @typeParam TSuccessEnvelope - Metadata fields present on a success result.
 * @typeParam TFailureEnvelope - Fields present on a failure result.
 */
export interface FetchClient<
  TSuccessEnvelope extends object,
  TFailureEnvelope extends object,
> {
  /**
   * Sends a request and returns the full {@link FetchResult} discriminated union.
   *
   * @param path    - Relative path or absolute URL.
   * @param options - Optional per-request options.
   */
  request<T>(
    path: string,
    options?: FetchClientOptions,
  ): Promise<FetchResult<T, TSuccessEnvelope, TFailureEnvelope>>;

  /** GET `path`. */
  get<T>(
    path: string,
    options?: FetchClientOptions,
  ): Promise<FetchResult<T, TSuccessEnvelope, TFailureEnvelope>>;

  /** POST `path` with an optional JSON-serialized `body`. */
  post<T>(
    path: string,
    body?: unknown,
    options?: FetchClientOptions,
  ): Promise<FetchResult<T, TSuccessEnvelope, TFailureEnvelope>>;

  /** PUT `path` with an optional JSON-serialized `body`. */
  put<T>(
    path: string,
    body?: unknown,
    options?: FetchClientOptions,
  ): Promise<FetchResult<T, TSuccessEnvelope, TFailureEnvelope>>;

  /** PATCH `path` with an optional JSON-serialized `body`. */
  patch<T>(
    path: string,
    body?: unknown,
    options?: FetchClientOptions,
  ): Promise<FetchResult<T, TSuccessEnvelope, TFailureEnvelope>>;

  /** DELETE `path` with an optional JSON-serialized `body`. */
  delete<T>(
    path: string,
    body?: unknown,
    options?: FetchClientOptions,
  ): Promise<FetchResult<T, TSuccessEnvelope, TFailureEnvelope>>;

  /**
   * Like {@link request}, but resolves to `TData` directly on success and
   * throws a {@link FetchClientError} on failure.
   *
   * Designed for query libraries (e.g. TanStack Query) where the query
   * function is expected to throw rather than return a discriminated union.
   *
   * @param path    - Relative path or absolute URL.
   * @param options - Optional per-request options.
   * @throws {@link FetchClientError} on failure.
   */
  query<T>(path: string, options?: FetchClientOptions): Promise<T>;
}

// ─── createFetchClient ────────────────────────────────────────────────────────

/**
 * Creates a fully-typed HTTP client with configurable response envelope shapes,
 * optional auth-adapter integration, and first-class timeout support.
 *
 * ```ts
 * // Custom envelope example
 * const client = createFetchClient({
 *   baseURL: "https://api.example.com",
 *   timeout: 10_000,
 *   toSuccess: (raw) => {
 *     const r = raw as { status: string; payload: unknown };
 *     return { status: r.status, data: r.payload };
 *   },
 *   toFailure: (_raw, status) => ({ code: status, reason: "error" }),
 *   onNetworkError: (err) => ({ code: 503, reason: String(err) }),
 * });
 *
 * const result = await client.get<User>("/users/me");
 * if (result.success) console.log(result.data.name);
 * ```
 *
 * For the default `ApiResponse` envelope use {@link createDefaultFetchClient}.
 *
 * @param config - Client configuration.
 * @returns A {@link FetchClient} instance.
 */
export function createFetchClient<
  TSuccessEnvelope extends object,
  TFailureEnvelope extends object,
>(
  config: FetchClientConfig<TSuccessEnvelope, TFailureEnvelope>,
): FetchClient<TSuccessEnvelope, TFailureEnvelope> {
  const {
    baseURL = "",
    timeout: globalTimeout,
    adapter,
    headers: defaultHeaders = {},
    credentials: defaultCredentials = "include",
    isSuccess = (_raw: unknown, response: Response) => response.ok,
    toSuccess,
    toFailure,
    onNetworkError,
  } = config;

  /**
   * Joins `baseURL` with `path`, normalising slashes.
   * Not used when an adapter is present — the adapter owns URL joining.
   */
  function buildUrl(path: string): string {
    if (!baseURL) return path;
    return `${baseURL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }

  async function request<T>(
    path: string,
    options?: FetchClientOptions,
  ): Promise<FetchResult<T, TSuccessEnvelope, TFailureEnvelope>> {
    // When an adapter is configured it handles baseURL joining internally.
    const url = adapter ? path : buildUrl(path);
    const effectiveTimeout = options?.timeout ?? globalTimeout;

    const mergedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...defaultHeaders,
      ...options?.headers,
    };

    try {
      const init: RequestInit = {
        method: options?.method,
        headers: mergedHeaders,
        body: options?.body,
        credentials: options?.credentials ?? defaultCredentials,
        ...options?.adapterInit,
      };

      const fetchCall: Promise<Response> = adapter
        ? adapter(url, init)
        : fetch(url, init);

      const response = await (effectiveTimeout
        ? withTimeout(fetchCall, effectiveTimeout)
        : fetchCall);

      // Gracefully handle non-JSON responses — adapters receive `undefined`.
      const raw: unknown = await response.json().catch(() => undefined);

      if (isSuccess(raw, response)) {
        return { success: true, ...toSuccess<T>(raw) };
      }

      return { success: false, ...toFailure(raw, response.status) };
    } catch (error) {
      return { success: false, ...onNetworkError(error) };
    }
  }

  function get<T>(path: string, options?: FetchClientOptions) {
    return request<T>(path, { ...options, method: "GET" });
  }

  function post<T>(path: string, body?: unknown, options?: FetchClientOptions) {
    return request<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  function put<T>(path: string, body?: unknown, options?: FetchClientOptions) {
    return request<T>(path, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  function patch<T>(path: string, body?: unknown, options?: FetchClientOptions) {
    return request<T>(path, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  function del<T>(path: string, body?: unknown, options?: FetchClientOptions) {
    return request<T>(path, {
      ...options,
      method: "DELETE",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async function query<T>(path: string, options?: FetchClientOptions): Promise<T> {
    const result = await request<T>(path, options);
    if (!result.success) throw new FetchClientError<TFailureEnvelope>(result);
    return result.data;
  }

  return { request, get, post, put, patch, delete: del, query };
}
