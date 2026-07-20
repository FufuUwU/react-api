/**
 * One error type for both of the API's error conventions.
 *
 * Worker routes (/discord, /minecraft) return:
 *   { success: false, error: { code, message } }
 * Durable Object routes (/plural, /devices, /guestbook) return:
 *   { detail: string }            — and occasionally { error: string }
 *
 * Both are normalised into `DoughminationError` so callers only ever handle
 * one shape.
 */
export class DoughminationError extends Error {
  /** HTTP status code. 0 for network/transport failures. */
  readonly status: number;
  /** Machine-readable code from Worker-style errors, e.g. "not_found". */
  readonly code: string | null;
  /** The parsed response body, when there was one. */
  readonly body: unknown;
  /** The request URL that failed. */
  readonly url: string;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string | null;
      body?: unknown;
      url: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "DoughminationError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.body = options.body;
    this.url = options.url;
  }

  /** True for 401/403 — a missing or rejected credential. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** True for 404. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True for 429 — guestbook posts are rate limited to one per 60s per IP. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** True when the request never got a response (offline, DNS, CORS). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Type guard for `DoughminationError`. */
export function isDoughminationError(
  err: unknown,
): err is DoughminationError {
  return err instanceof DoughminationError;
}
