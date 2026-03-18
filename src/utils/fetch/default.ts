import { createFetchClient, type FetchClient, type FetchClientConfig } from "./client";
import { defaultOnNetworkError, defaultToFailure, defaultToSuccess } from "./adapter";
import type { DefaultFailureEnvelope, DefaultSuccessEnvelope } from "./envelopes";


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
