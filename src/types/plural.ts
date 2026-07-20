/**
 * Plural system types (/v2/plural/*).
 *
 * The API proxies PluralKit v2 and enriches each member with its own `tags`
 * and `status` fields (see `services/tags.ts` and `services/status.ts`), then
 * returns the object **bare** — no { success, data } envelope. Errors from
 * this namespace are `{ detail: string }`.
 *
 * PluralKit's own fields are typed from the documented v2 member schema and
 * are all optional: PluralKit omits fields the system's privacy settings hide,
 * and the API passes the object through untouched. The index signature keeps
 * new upstream fields accessible without a package bump.
 */

/** PluralKit privacy setting on an individual field. */
export type PluralPrivacy = "public" | "private" | null;

/** Per-member privacy block (present only when the token owns the system). */
export interface PluralMemberPrivacy {
  visibility?: PluralPrivacy;
  name_privacy?: PluralPrivacy;
  description_privacy?: PluralPrivacy;
  birthday_privacy?: PluralPrivacy;
  pronoun_privacy?: PluralPrivacy;
  avatar_privacy?: PluralPrivacy;
  metadata_privacy?: PluralPrivacy;
  proxy_privacy?: PluralPrivacy;
  [key: string]: PluralPrivacy | undefined;
}

/** A PluralKit proxy tag pair, e.g. { prefix: "c:", suffix: null }. */
export interface PluralProxyTag {
  prefix: string | null;
  suffix: string | null;
}

/**
 * A status note the API attaches to a member (its own feature, not
 * PluralKit's). Set via POST /v2/plural/members/:id/status.
 */
export interface PluralMemberStatus {
  text: string;
  emoji: string | null;
  /** ISO 8601 timestamp. */
  updated_at: string;
}

/**
 * A system member: PluralKit's member object plus this API's enrichments.
 *
 * `tags` and `status` are always added by the REST routes. Careful: the
 * `fronters_update` socket event broadcasts the *unenriched* PluralKit
 * object, so those two fields are absent there — the package merges socket
 * payloads over the cached REST data to preserve them.
 */
export interface PluralMember {
  /** Short 5–6 char id, e.g. "abcdef". Also used as the tag/status key. */
  id: string;
  /** Stable UUID for the member. */
  uuid?: string;
  name?: string;
  /**
   * Display name. The API overrides this for a few special members
   * (see SPECIAL_DISPLAY_NAMES in services/pluralkit.ts), setting
   * `is_special` and preserving `original_name`.
   */
  display_name?: string | null;
  /** Hex colour without the leading "#", e.g. "ff99cc". */
  color?: string | null;
  /** "YYYY-MM-DD"; PluralKit uses year 0004 to mean "year hidden". */
  birthday?: string | null;
  pronouns?: string | null;
  avatar_url?: string | null;
  webhook_avatar_url?: string | null;
  banner?: string | null;
  description?: string | null;
  created?: string | null;
  proxy_tags?: PluralProxyTag[];
  keep_proxy?: boolean;
  autoproxy_enabled?: boolean | null;
  message_count?: number | null;
  last_message_timestamp?: string | null;
  privacy?: PluralMemberPrivacy | null;

  // ---- Doughmination API enrichments ------------------------------------
  /** Tags from the API's own member-tag store (e.g. ["Host"]). */
  tags?: string[];
  /** Status note from the API's own store; null when none is set. */
  status?: PluralMemberStatus | null;
  /** True when the API substituted a special display name. */
  is_special?: boolean;
  /** The member's real PluralKit name when `is_special` is true. */
  original_name?: string;

  /** Forward-compat: any field PluralKit adds later. */
  [key: string]: unknown;
}

/**
 * GET /v2/plural/fronters — PluralKit's fronters object.
 *
 * `members` is absent (not just empty) when PluralKit reports no current
 * front, which is why it's optional here.
 */
export interface FrontersResponse {
  /** ISO 8601 timestamp of the current switch. */
  timestamp?: string;
  members?: PluralMember[];
  [key: string]: unknown;
}

/** GET /v2/plural/mental-state */
export interface MentalState {
  /** Free-form level string; the API's default seed is "safe". */
  level: string;
  /** ISO 8601 timestamp (serialized from a Date server-side). */
  updated_at: string;
  notes?: string | null;
}

/**
 * GET /v2/plural/system — PluralKit's system object with `mental_state`
 * merged in by the API.
 */
export interface PluralSystem {
  id?: string;
  uuid?: string;
  name?: string | null;
  description?: string | null;
  tag?: string | null;
  avatar_url?: string | null;
  banner?: string | null;
  color?: string | null;
  created?: string | null;
  timezone?: string | null;
  /** Merged in by the API from its own store. */
  mental_state?: MentalState;
  [key: string]: unknown;
}

/** GET /v2/plural/members/:identifier/status */
export interface MemberStatusResponse {
  success: boolean;
  member_identifier: string;
  status: PluralMemberStatus | null;
}

// ---- Auth ------------------------------------------------------------------

/** POST /v2/plural/login */
export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  success: boolean;
}

/** The user shape returned by /user_info and signup. */
export interface UserResponse {
  id: string;
  username: string;
  display_name?: string | null;
  is_admin: boolean;
  is_owner: boolean;
  is_pet: boolean;
  avatar_url?: string | null;
}

/** POST /v2/plural/signup */
export interface SignupResponse {
  success: boolean;
  message: string;
  user: UserResponse;
}

/** GET /v2/plural/users/check-username */
export interface UsernameCheckResponse {
  username: string;
  exists: boolean;
  available: boolean;
}

// ---- Writes ----------------------------------------------------------------

/** POST /v2/plural/switch and /multi_switch responses. */
export interface SwitchResponse {
  status?: string;
  success?: boolean;
  message?: string;
  fronters?: Array<{ id: string; name: string; display_name: string }>;
  count?: number;
  data?: unknown;
}
