import { TimeoutError } from "./timeout";

type NetworkErrorKind = "timeout" | "cors" | "offline" | "dns" | "connection" | "unknown";

interface ClassifiedError {
  kind: NetworkErrorKind;
  message: string;
  code: number;
  errorId: string;
  trace: string[];
}

function getOriginalError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "UnknownError", message: String(error) };
}

export default function classifyNetworkError(error: unknown): ClassifiedError {
  const original = getOriginalError(error);
  const lower = original.message.toLowerCase();

  // Timeout
  if (error instanceof TimeoutError) {
    return {
      kind: "timeout",
      message: "Request timed out. The server took too long to respond.",
      code: 408,
      errorId: "CLIENT_TIMEOUT",
      trace: [
        `Request exceeded configured timeout.`,
      ],
    };
  }

  // CORS
  const isCorsByMessage =
    lower.includes("cors") ||
    lower.includes("cross-origin") ||
    lower.includes("preflight") ||
    lower.includes("access-control") ||
    lower.includes("blocked by cors policy");

  if (isCorsByMessage) {
    return {
      kind: "cors",
      message: "CORS blocked this request. Check if the API allows your origin and method.",
      code: 0,
      errorId: "CLIENT_CORS_ERROR",
      trace: [
        `The browser blocked the request before it reached the server.`,
        `Check Access-Control-Allow-Origin headers on the API.`,
      ],
    };
  }

  // Offline
  if (
    lower.includes("internet disconnected") ||
    lower.includes("network changed") ||
    lower.includes("offline") ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  ) {
    return {
      kind: "offline",
      message: "You are offline. Check your internet connection.",
      code: 0,
      errorId: "CLIENT_OFFLINE",
      trace: [
        `No network connectivity detected.`,
        `navigator.onLine: ${typeof navigator !== "undefined" ? navigator.onLine : "unknown"}`,
      ],
    };
  }

  // DNS
  if (
    lower.includes("name_not_resolved") ||
    lower.includes("not resolve") ||
    lower.includes("dns") ||
    lower.includes("enotfound")
  ) {
    return {
      kind: "dns",
      message: "Could not resolve the server address. Check the URL.",
      code: 0,
      errorId: "CLIENT_DNS_ERROR",
      trace: [
        `DNS lookup failed — the domain could not be found.`,
        `Verify the hostname or your DNS settings.`,
      ],
    };
  }

  // Connection refused
  if (
    lower.includes("connection_refused") ||
    lower.includes("econnrefused") ||
    lower.includes("unable to connect")
  ) {
    const traces = [
      `Connection refused — the server actively rejected the request.`,
      `The API may be down or the port may be wrong.`,
    ];
    return {
      kind: "connection",
      message: "Connection refused. The server may be down.",
      code: 503,
      errorId: "CLIENT_CONNECTION_REFUSED",
      trace: traces,
    };
  }

  // "Failed to fetch" / "NetworkError"
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("fetch failed") ||
    lower.includes("load failed")
  ) {
    const traces = [
      `The browser could not complete the request.`,
      `This usually means one of: CORS blocked it, the server is down, or the URL is wrong.`,
    ];
    return {
      kind: "connection",
      message: "Request failed. Check the browser console for details (CORS, server down, or bad URL).",
      code: 0,
      errorId: "CLIENT_REQUEST_FAILED",
      trace: traces,
    };
  }

  // Unmapped
  return {
    kind: "unknown",
    message: original.message || "Network error.",
    code: 0,
    errorId: "CLIENT_NETWORK_ERROR",
    trace: original.stack
      ? [original.stack]
      : [`${original.name}: ${original.message}`],
  };
}