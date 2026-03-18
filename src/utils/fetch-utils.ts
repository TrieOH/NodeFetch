import { logger } from "./logger";

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
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;

  const timer = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });

  return Promise.race([promise.finally(() => clearTimeout(timerId)), timer]);
}

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

// ─── FetchResult ──────────────────────────────────────────────────────────────

/**
 * Discriminated union returned by every method of a {@link FetchClient}.
 *
 * Narrow on `result.success` to access the typed payload or the failure
 * envelope:
 * ```ts
 * const result = await client.get<User>("/users/me");
 * if (result.success) {
 *   console.log(result.data);  // User
 * } else {
 *   console.error(result);     // TFailureEnvelope & { success: false }
 * }
 * ```
 *
 * @typeParam TData            - Type of the payload on a successful response.
 * @typeParam TSuccessEnvelope - Extra metadata fields present on success.
 * @typeParam TFailureEnvelope - Fields present on failure.
 */
export type FetchResult<
  TData,
  TSuccessEnvelope extends object,
  TFailureEnvelope extends object,
> =
  | (TSuccessEnvelope & { success: true; data: TData })
  | (TFailureEnvelope & { success: false });

// ─── Default envelope types ───────────────────────────────────────────────────

/** Fields shared by every response in the built-in default envelope scheme. */
export interface DefaultBaseEnvelope {
  /** Origin module / service that produced the response. */
  module: string;
  /** Human-readable description of the outcome. */
  message: string;
  /** ISO 8601 timestamp of the response. */
  timestamp: string;
  /** Application-level status code (may differ from the HTTP status). */
  code: number;
}

/** Default success envelope — base fields merged with `{ data: T }`. */
export type DefaultSuccessEnvelope = DefaultBaseEnvelope;

/** Default failure envelope — base fields plus error identification. */
export interface DefaultFailureEnvelope extends DefaultBaseEnvelope {
  /** Machine-readable error identifier (e.g. `"USER_NOT_FOUND"`). */
  error_id: string;
  /** Optional stack trace or server breadcrumb list. */
  trace?: string[];
}

/**
 * Convenience alias for a {@link FetchResult} using the built-in default
 * envelopes. Mirrors the pre-existing `ApiResponse<T>` shape exactly.
 */
export type DefaultFetchResult<T> = FetchResult<
  T,
  DefaultSuccessEnvelope,
  DefaultFailureEnvelope
>;

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
 * Every method except {@link query} returns a {@link FetchResult} discriminated
 * union — narrow on `result.success` before accessing `result.data`.
 * {@link query} resolves to `TData` directly and throws {@link FetchClientError}
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
        credentials: options?.credentials ?? "include",
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

// ─── Default adapters ─────────────────────────────────────────────────────────

/** Internal raw shape expected by the default adapters. */
type RawDefault<T> = Partial<DefaultBaseEnvelope> & {
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
  const message =
    error instanceof Error ? error.message : "A network or unknown error occurred.";
  const trace =
    error instanceof Error ? [error.stack ?? message] : [String(error)];

  return {
    module: "Network",
    message,
    timestamp: new Date().toISOString(),
    code: 503,
    error_id: "CLIENT_NETWORK_ERROR",
    trace,
  };
}

// ─── createDefaultFetchClient ─────────────────────────────────────────────────

/**
 * Configuration for {@link createDefaultFetchClient}.
 *
 * Identical to the full {@link FetchClientConfig} for default envelopes,
 * except `toSuccess`, `toFailure`, and `onNetworkError` are **optional** — they
 * fall back to the built-in default adapters when omitted.
 */
export type DefaultFetchClientConfig = Omit<
  FetchClientConfig<DefaultSuccessEnvelope, DefaultFailureEnvelope>,
  "toSuccess" | "toFailure" | "onNetworkError"
> & {
  /**
   * Override the success-mapping adapter.
   * @default {@link defaultToSuccess}
   */
  toSuccess?: FetchClientConfig<
    DefaultSuccessEnvelope,
    DefaultFailureEnvelope
  >["toSuccess"];
  /**
   * Override the failure-mapping adapter.
   * @default {@link defaultToFailure}
   */
  toFailure?: FetchClientConfig<
    DefaultSuccessEnvelope,
    DefaultFailureEnvelope
  >["toFailure"];
  /**
   * Override the network-error adapter.
   * @default {@link defaultOnNetworkError}
   */
  onNetworkError?: FetchClientConfig<
    DefaultSuccessEnvelope,
    DefaultFailureEnvelope
  >["onNetworkError"];
};

/**
 * Creates a {@link FetchClient} pre-configured with the default response
 * envelope (mirrors the original `ApiResponse<T>` / `DefaultFetchResult<T>`
 * shape). Any adapter can be individually overridden.
 *
 * ```ts
 * const client = createDefaultFetchClient({
 *   adapter: myInterceptor,
 *   timeout: 8_000,
 * });
 *
 * const result = await client.get<User>("/users/me");
 * if (result.success) console.log(result.data.name);
 * ```
 *
 * @param config - Optional configuration. Adapter fields default to the
 *   built-in implementations when omitted.
 */
export function createDefaultFetchClient(
  config?: DefaultFetchClientConfig,
): FetchClient<DefaultSuccessEnvelope, DefaultFailureEnvelope> {
  return createFetchClient<DefaultSuccessEnvelope, DefaultFailureEnvelope>({
    ...config,
    toSuccess: config?.toSuccess ?? defaultToSuccess,
    toFailure: config?.toFailure ?? defaultToFailure,
    onNetworkError: config?.onNetworkError ?? defaultOnNetworkError,
  });
}