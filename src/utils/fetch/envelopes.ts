import type { FetchClient } from "./client";

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
