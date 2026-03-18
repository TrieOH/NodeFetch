
// ─── Logger ───────────────────────────────────────────────────────────────────
export { Logger, logger } from "./utils/logger";

// ─── Fetch utils ──────────────────────────────────────────────────────────────
export {
    // Simple Utils
    simpleFetch,
    type SimpleFetchOptions,

    // Adapter type
    type FetchAdapter,

    // Result Types
    type FetchResult,
    type DefaultFetchResult,

    // Default Envelope
    type DefaultBaseEnvelope,
    type DefaultSuccessEnvelope,
    type DefaultFailureEnvelope,

    // Options and config
    type FetchClientOptions,
    type FetchClientConfig,
    type DefaultFetchClientConfig,

    // Client and Errors
    type FetchClient,
    FetchClientError,
    TimeoutError,

    // Factories
    createFetchClient,
    createDefaultFetchClient,

    // Default Adapters
    defaultToSuccess,
    defaultToFailure,
    defaultOnNetworkError,
} from "./utils/fetch-utils";