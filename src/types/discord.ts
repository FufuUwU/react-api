/**
 * Discord types — transcribed by hand from the API's `src/types.ts`.
 *
 * Served by:
 *   GET /v2/discord/users/:id     -> { success, data: UnifiedRecord }
 *   GET /v2/discord/users?ids=... -> { success, data: Record<id, UnifiedRecord | null> }
 *
 * Fields marked "rich profile only" are null when the deployment runs
 * bot-token-only (no DISCORD_USER_TOKEN configured).
 */

export type DiscordStatus = "online" | "idle" | "dnd" | "offline";

/** A decoded public user flag (whether or not it has badge art). */
export interface UnifiedFlag {
  /** e.g. "active_developer", "verified_bot", or "unknown_<bit>" if new. */
  id: string;
  /** Human-readable name, e.g. "Active Developer". */
  name: string;
}

export interface UnifiedClanTag {
  guild_id: string;
  tag: string;
  badge: string | null;
  badge_url: string | null;
}

export interface UnifiedBadge {
  /** Discord badge id, e.g. "hypesquad_house_3", "orb_profile_badge". */
  id: string;
  description: string;
  /** CDN icon hash (badge-icons) when known. */
  icon: string | null;
  icon_url: string | null;
  link: string | null;
  /** Where the badge came from: classic public-flag, or the rich profile. */
  source: "flags" | "profile";
}

/**
 * A badge from a third-party client-mod aggregator (badges.equicord.org),
 * covering Vencord/Equicord/Aliucord and the "global badges" set. Kept
 * separate from `badges` because the source is unofficial.
 */
export interface UnifiedClientBadge {
  /** Stable id derived from tooltip + icon_url (upstream has no id of its own). */
  id: string;
  tooltip: string;
  icon_url: string;
  /** Client-mod service inferred from the icon host; "Equicord" for unknowns. */
  source: string;
}

export interface UnifiedConnectedAccount {
  type: string;
  id: string;
  name: string;
  verified: boolean;
}

/** Human-readable collectible kind, mapped from Discord's numeric product type. */
export type WishlistItemType =
  | "avatar_decoration"
  | "profile_effect"
  | "nameplate"
  | "profile_frame"
  | "bundle"
  | "variants_group"
  | "external_sku"
  | "unknown";

/** One collectible the user has EQUIPPED on their profile. */
export interface UnifiedCollectible {
  /** Raw slot key ("nameplate", "profile_frame", …) — new slots surface as-is. */
  slot: string;
  sku_id: string;
  type: WishlistItemType;
  /** Raw Discord numeric product type; null if unresolved. */
  type_id: number | null;
  name: string | null;
  summary: string | null;
  label: string | null;
  static_image_url: string | null;
  animated_image_url: string | null;
  video_url: string | null;
  /** Nameplate colour palette (e.g. "bubble_gum"); null for other kinds. */
  palette: string | null;
  /** Unix seconds the equipped item expires; null if permanent. */
  expires_at: number | null;
}

/** One Discord Shop collectible saved to the user's profile wishlist. */
export interface UnifiedWishlistItem {
  sku_id: string;
  type: WishlistItemType;
  type_id: number | null;
  name: string | null;
  summary: string | null;
  static_image_url: string | null;
  animated_image_url: string | null;
  video_url: string | null;
  label: string | null;
  is_owned: boolean | null;
  /** Minor units: amount=599, exponent=2, currency="gbp" => £5.99. */
  price: { amount: number; currency: string; exponent: number } | null;
  /** Wishlist visibility (1 = everyone); null if unknown. */
  visibility: number | null;
  updated_at: string | null;
}

/** Nitro / premium subscription state, decoded from the rich profile. */
export interface UnifiedPremium {
  /** Raw Discord premium_type (0 none, 1 classic, 2 nitro, 3 basic). */
  type_id: number | null;
  type: "none" | "classic" | "nitro" | "basic" | "unknown";
  since: string | null;
  guild_since: string | null;
}

export interface UnifiedDisplayNameStyles {
  /** 1 or 2 ints; the name-text gradient stops. */
  colors: number[] | null;
  font_id: number | null;
  effect_id: number | null;
}

export interface UnifiedUser {
  id: string;
  username: string;
  global_name: string | null;
  display_name: string | null;
  /** Pre-2023 "name#1234" handle when Discord still exposes it. */
  legacy_username: string | null;

  avatar: string | null;
  avatar_url: string;
  banner: string | null;
  banner_url: string | null;
  accent_color: number | null;

  /** Raw `public_flags` bitfield. */
  public_flags: number;
  /** Decoded public flags (badge and non-badge), incl. new/unknown ones. */
  flags: UnifiedFlag[];

  clan: UnifiedClanTag | null;

  /** Rich profile only (needs user token); null otherwise. */
  bio: string | null;
  pronouns: string | null;
  /** Nitro profile gradient — [top, bottom] ints; null if not set. */
  theme_colors: number[] | null;
  display_name_styles: UnifiedDisplayNameStyles | null;
  premium: UnifiedPremium | null;
}

export interface UnifiedSpotify {
  track_id: string | null;
  song: string;
  artist: string;
  album: string;
  album_art_url: string | null;
  timestamps: { start: number | null; end: number | null } | null;
}

export interface UnifiedCustomStatus {
  text: string | null;
  emoji: {
    id: string | null;
    name: string | null;
    animated: boolean;
    url: string | null;
  } | null;
}

/**
 * Live presence for one user. Delivered by REST inside `UnifiedRecord`, and
 * over the socket as the `presence_update` payload / the values of the
 * `init_state` map.
 */
export interface UnifiedPresence {
  user_id: string;
  status: DiscordStatus;
  online: boolean;
  platform: { desktop: boolean; mobile: boolean; web: boolean };
  /** Per-platform status — richer than the booleans above. */
  client_status: {
    desktop: DiscordStatus | null;
    mobile: DiscordStatus | null;
    web: DiscordStatus | null;
  };
  active_platforms: Array<"desktop" | "mobile" | "web">;
  /** True when any activity is a Streaming (type 1) activity. */
  streaming: boolean;
  stream_url: string | null;
  /** Raw Discord activities (custom status / type-4 stripped out). */
  activities: DiscordActivity[];
  custom_status: UnifiedCustomStatus | null;
  listening_to_spotify: boolean;
  spotify: UnifiedSpotify | null;
  updated_at: number;
}

/**
 * Raw Discord activity. The API passes these straight through from the
 * gateway (typed `any[]` upstream), so the documented fields are optional and
 * an index signature keeps forward-compatibility.
 */
export interface DiscordActivity {
  id?: string;
  name?: string;
  /** 0 playing, 1 streaming, 2 listening, 3 watching, 4 custom, 5 competing. */
  type?: number;
  url?: string | null;
  created_at?: number;
  timestamps?: { start?: number; end?: number };
  application_id?: string;
  details?: string | null;
  state?: string | null;
  emoji?: { id?: string; name?: string; animated?: boolean };
  party?: { id?: string; size?: [number, number] };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  buttons?: string[];
  flags?: number;
  [key: string]: unknown;
}

/** Per-guild membership for a user in one tracked guild (bot-token data). */
export interface UnifiedGuildMembership {
  guild_id: string;
  guild_name: string | null;
  guild_icon_url: string | null;
  nick: string | null;
  /** Guild-specific avatar if set, else the global avatar. */
  avatar_url: string;
  roles: string[];
  joined_at: string | null;
  premium_since: string | null;
  pending: boolean;
  communication_disabled_until: string | null;
}

/** Timezone from the Vencord/Equicord Timezones plugin backend. */
export interface UnifiedTimezone {
  /** IANA timezone id, e.g. "Europe/London". */
  timezone: string;
  /** Current local time in that zone (ISO 8601 with offset). */
  local_time: string | null;
  /** UTC offset in minutes at read time; null if uncomputable. */
  utc_offset_minutes: number | null;
}

/** One ReviewDB review left on a user's profile. */
export interface UnifiedReview {
  id: number | null;
  comment: string;
  sender_id: string | null;
  sender_username: string | null;
  sender_avatar_url: string | null;
  type: number | null;
  timestamp: string | null;
}

export interface UnifiedReviews {
  count: number;
  reviews: UnifiedReview[];
}

/** The full merged record: REST profile + gateway presence + enrichments. */
export interface UnifiedRecord {
  user: UnifiedUser;
  /** null when the user shares no monitored guild with the bot. */
  presence: UnifiedPresence | null;
  badges: UnifiedBadge[];
  /** [] if none found; null if the aggregator couldn't be reached. */
  clientBadges: UnifiedClientBadge[] | null;
  connected_accounts: UnifiedConnectedAccount[];
  /** null when unavailable (no user token); [] means reachable but empty. */
  wishlist: UnifiedWishlistItem[] | null;
  /** The ONLY place equipped collectibles appear (avatar deco included). */
  collectibles: UnifiedCollectible[] | null;
  /** null when not configured; [] when the user is in none of them. */
  guild_memberships: UnifiedGuildMembership[] | null;
  /** Pronouns from PronounDB (distinct from Discord's own profile pronouns). */
  pronoundb: string | null;
  timezone: UnifiedTimezone | null;
  reviews: UnifiedReviews | null;
  updated_at: number;
  source: {
    presence: "gateway" | "none";
    profile: "bot" | "user";
  };
}

/** Batch response body of GET /v2/discord/users?ids=… */
export type UnifiedRecordMap = Record<string, UnifiedRecord | null>;

/** GET /v2/discord/status — gateway connection debug info. */
export interface DiscordGatewayStatus {
  connected: boolean;
  tracked?: number;
  connected_since?: number | null;
  [key: string]: unknown;
}
