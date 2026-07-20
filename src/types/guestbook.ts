/**
 * Guestbook types (/v2/guestbook).
 *
 *   GET  /v2/guestbook?limit=50&offset=0  -> GuestbookPage   (public, newest first)
 *   POST /v2/guestbook                    -> GuestbookPostResult (Turnstile + honeypot + rate limit)
 *   DELETE /v2/guestbook/:id              -> requires X-Battery-Key
 */

export interface GuestbookEntry {
  /** Random UUID assigned on insert; delete by this. */
  id: string;
  name: string;
  message: string;
  /** Normalised http(s) URL, or "" when none was given / it was rejected. */
  website: string;
  /** Unix milliseconds. */
  ts: number;
}

/** GET /v2/guestbook — `limit` is clamped server-side to 1–200 (default 50). */
export interface GuestbookPage {
  entries: GuestbookEntry[];
  /** Total entries stored, ignoring limit/offset. */
  total: number;
  /** The effective limit after clamping. */
  limit: number;
  offset: number;
}

/** Server-enforced field limits (from services/guestbook.ts). */
export const GUESTBOOK_LIMITS = {
  name: 40,
  message: 500,
  website: 200,
} as const;

/** Minimum seconds between posts from one IP. */
export const GUESTBOOK_RATE_LIMIT_SECONDS = 60;

export interface GuestbookPostInput {
  /** ≤40 chars after cleaning. Required. */
  name: string;
  /** ≤500 chars after cleaning. Required. */
  message: string;
  /** Optional; a bare domain gets "https://" prefixed, non-http(s) is dropped. */
  website?: string;
  /**
   * Turnstile token from the consuming app's widget. Required whenever the
   * deployment has TURNSTILE_SECRET configured — the package cannot generate
   * this. See the `turnstile` provider option.
   */
  turnstileToken?: string;
}

/**
 * POST /v2/guestbook result.
 *
 * `skipped: true` means the honeypot field was filled — the API returns a
 * fake success and silently drops the entry, so `entry` is absent.
 */
export interface GuestbookPostResult {
  ok: boolean;
  entry?: GuestbookEntry;
  skipped?: boolean;
}
